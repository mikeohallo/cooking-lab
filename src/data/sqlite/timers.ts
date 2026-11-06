/**
 * Kitchen timers in the notebook (schema version 6, 0.5.0).
 *
 * The repository knows SQL; the service asks the pure timer rules in
 * `src/timers/model.ts` whether a change is allowed and stores the timer they
 * hand back, unchanged, as the cook. A timer is written by the user only,
 * like a reading: the assistant has no door here.
 */

import type { CookId, IsoTimestamp, Timer, TimerId } from '../../domain/entities';
import type { Actor, EvidenceDecision } from '../../domain/evidence';
import { denyIfNotUser } from '../../domain/evidence';
import {
  addToTimer,
  colourForName,
  finishTimer,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  type TimerChange,
} from '../../timers/model';
import type { DatabaseAdapter } from '../adapters';
import type { TimerRepository, TimerService } from '../repositories';
import { RecordNotFoundError } from './repositories';
import { TIMER_COLUMNS, timerParams, toTimer } from './rows';

const KEPT_COOK = 'cook_id NOT IN (SELECT cook_id FROM cook_deletions)';

export function createTimerRepository(adapter: DatabaseAdapter): TimerRepository {
  const list = async (where: string, params: readonly (string | number)[]) => {
    const rows = await adapter.select({
      sql: `SELECT ${TIMER_COLUMNS} FROM timers WHERE ${where} ORDER BY started_at ASC, id ASC`,
      params: [...params],
    });
    return rows.map(toTimer);
  };

  return {
    async put(timer: Timer): Promise<Timer> {
      await adapter.execute({
        sql: `INSERT INTO timers (${TIMER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name, colour = excluded.colour, length_ms = excluded.length_ms,
                started_at = excluded.started_at, ends_at = excluded.ends_at,
                paused_left_ms = excluded.paused_left_ms, ran_out_at = excluded.ran_out_at,
                stopped_at = excluded.stopped_at`,
        params: timerParams(timer),
      });
      return timer;
    },

    async findById(id: TimerId): Promise<Timer | null> {
      const found = await list('id = ?', [id]);
      return found[0] ?? null;
    },

    listForCook(cookId: CookId) {
      return list('cook_id = ?', [cookId]);
    },

    listLive() {
      return list(`stopped_at IS NULL AND ${KEPT_COOK}`, []);
    },

    listAll() {
      return list(KEPT_COOK, []);
    },
  };
}

type TimerServiceDependencies = {
  readonly timers: TimerRepository;
  readonly findCook: (id: CookId) => Promise<{ readonly status: string } | null>;
};

function decide(change: TimerChange): EvidenceDecision<Timer> {
  return change.ok
    ? { allowed: true, record: change.timer }
    : { allowed: false, code: 'timer_not_valid', message: change.message };
}

export function createTimerService({ timers, findCook }: TimerServiceDependencies): TimerService {
  const load = async (id: TimerId): Promise<Timer> => {
    const timer = await timers.findById(id);
    if (timer === null) {
      throw new RecordNotFoundError('timer', id);
    }
    return timer;
  };

  /** Rule 1 first, then the timer rule; written only when both allow it. */
  const change = async (
    id: TimerId,
    actor: Actor,
    apply: (timer: Timer) => TimerChange,
  ): Promise<EvidenceDecision<Timer>> => {
    const denial = denyIfNotUser(actor, 'a timer');
    if (denial) {
      return denial;
    }
    const decision = decide(apply(await load(id)));
    if (decision.allowed) {
      await timers.put(decision.record);
    }
    return decision;
  };

  return {
    async start(cookId, name, lengthMs, identity, actor, at: IsoTimestamp) {
      const denial = denyIfNotUser(actor, 'a timer');
      if (denial) {
        return denial;
      }
      const cook = await findCook(cookId);
      if (cook === null) {
        throw new RecordNotFoundError('cook', cookId);
      }
      if (cook.status !== 'open') {
        return { allowed: false, code: 'timer_not_valid', message: 'A timer starts only on a cook still cooking.' };
      }
      const colour = colourForName(name, await timers.listAll());
      const decision = decide(startTimer({ id: identity.id, cookId, name, colour, lengthMs }, Date.parse(at)));
      if (decision.allowed) {
        await timers.put(decision.record);
      }
      return decision;
    },
    pause: (id, actor, at) => change(id, actor, (timer) => pauseTimer(timer, Date.parse(at))),
    resume: (id, actor, at) => change(id, actor, (timer) => resumeTimer(timer, Date.parse(at))),
    add: (id, extraMs, actor, at) => change(id, actor, (timer) => addToTimer(timer, extraMs, Date.parse(at))),
    stop: (id, actor, at) => change(id, actor, (timer) => stopTimer(timer, Date.parse(at))),
    finish: (id, endedAt, actor) => change(id, actor, (timer) => finishTimer(timer, Date.parse(endedAt))),
  };
}
