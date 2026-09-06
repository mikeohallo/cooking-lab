import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

import {
  AI_SERVICE_OPERATIONS,
  findDatabaseHandles,
  type AiService,
} from '../src/data/adapters';
import {
  AI_NOT_CONNECTED_MESSAGE,
  createUnavailableAiService,
} from '../src/data/ai/unavailable';
import {
  ProductionAiSubstitutionError,
  selectAiService,
} from '../src/data/ai/selection';
import { isAllowed, type EvidenceDecision } from '../src/domain/evidence';
import { createFixtureAiService } from './support/fixtureAi';
import { openTestDatabase, type TestDatabase } from './support/database';

/**
 * The assistant seam.
 *
 * Three things are proven here, and they are the three that would each on their
 * own be enough to put an invented claim in front of a cook: that the shipped
 * assistant fabricates nothing, that no assistant can reach storage, and that
 * the production build cannot end up running a stand-in.
 */

const T0 = '2026-09-05T18:00:00.000Z';
const T2 = '2026-09-06T09:00:00.000Z';

const CONTEXT = {
  cook: {
    id: 'cook-01',
    title: 'Weeknight rice',
    status: 'open' as const,
    provenance: 'live' as const,
    parentCookId: null,
    startedAt: T0,
    reviewOpenedAt: null,
    reviewSavedAt: null,
    verdict: null,
    createdAt: T0,
  },
  events: [
    {
      id: 'event-01',
      cookId: 'cook-01',
      ts: T0,
      kind: 'user_note' as const,
      body: 'Lid on.',
      meta: null,
      photoPath: null,
    },
  ],
};

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!isAllowed(decision)) {
    throw new Error(`expected the operation to be allowed, but it was refused: ${decision.code}`);
  }
  return decision.record;
}

describe('the shipped assistant says it is not connected, and invents nothing', () => {
  const assistant = createUnavailableAiService();

  it('provides all four operations', () => {
    for (const operation of AI_SERVICE_OPERATIONS) {
      expect(typeof (assistant as unknown as Record<string, unknown>)[operation]).toBe('function');
    }
    expect(Object.keys(assistant).sort()).toEqual([...AI_SERVICE_OPERATIONS].sort());
  });

  it('refuses to extract findings, and returns no candidates at all', async () => {
    const outcome = await assistant.extractCook(CONTEXT);

    expect(outcome.available).toBe(false);
    if (!outcome.available) {
      expect(outcome.reason).toBe('ai_not_connected');
      expect(outcome.message).toBe(AI_NOT_CONNECTED_MESSAGE);
    }
    // Not an empty candidate set: an empty answer would read as "the assistant
    // looked and found nothing", which is a different and untrue statement.
    expect(outcome).not.toHaveProperty('result');
  });

  it('refuses to write a briefing, a reply or an import candidate', async () => {
    const outcomes = [
      await assistant.createBriefing({ cookId: 'cook-01', sourceCooks: [CONTEXT] }),
      await assistant.chat({ context: CONTEXT, history: [], message: 'why was it wet?' }),
      await assistant.importCandidates({ batchId: 'import-01', documentText: 'some notes' }),
    ];

    for (const outcome of outcomes) {
      expect(outcome.available).toBe(false);
      expect(outcome).not.toHaveProperty('result');
      if (!outcome.available) {
        expect(outcome.reason).toBe('ai_not_connected');
      }
    }
  });

  it('says so in the same words every time, so a screen has one thing to show', async () => {
    const first = await assistant.chat({ context: CONTEXT, history: [], message: 'a' });
    const second = await assistant.chat({ context: CONTEXT, history: [], message: 'b' });

    expect(first).toEqual(second);
  });
});

describe('no assistant is given anything it could write with', () => {
  it('finds no handle on the shipped assistant', () => {
    expect(findDatabaseHandles(createUnavailableAiService())).toEqual([]);
  });

  it('finds no handle on the test-only assistant either', () => {
    expect(findDatabaseHandles(createFixtureAiService())).toEqual([]);
  });

  it('finds one the moment a data layer is attached to either of them', async () => {
    const db = await openTestDatabase('ai-handles.db');

    expect(findDatabaseHandles({ ...createUnavailableAiService(), data: db.data })).toContain(
      'data',
    );
    expect(findDatabaseHandles({ ...createFixtureAiService(), database: db.adapter })).toContain(
      'database',
    );
    expect(
      findDatabaseHandles({ ...createUnavailableAiService(), repositories: db.data.cooks }),
    ).toContain('repositories');

    await db.close();
  });

  it('holds nothing at all, so there is nothing to be a handle', () => {
    const assistant = createUnavailableAiService();
    const values = Object.values(assistant as unknown as Record<string, unknown>);

    // Four functions, no captured state, no properties.
    expect(values).toHaveLength(4);
    expect(values.every((value) => typeof value === 'function')).toBe(true);
  });

  it('has no module under src that both constructs an assistant and imports the data layer', () => {
    const root = resolve(__dirname, '..');
    const aiDirectory = join(root, 'src', 'data', 'ai');
    const offenders = readdirSync(aiDirectory)
      .filter((entry) => entry.endsWith('.ts'))
      .filter((entry) => {
        const contents = readFileSync(join(aiDirectory, entry), 'utf8');
        return /from '\.\.\/repositories'|from '\.\.\/sqlite\//.test(contents);
      });

    expect(offenders).toEqual([]);
  });
});

describe('the production build cannot end up with a stand-in assistant', () => {
  it('gives production the unavailable assistant', async () => {
    const chosen = selectAiService({ variant: 'production' });

    const outcome = await chosen.extractCook(CONTEXT);
    expect(outcome.available).toBe(false);
  });

  it('throws rather than quietly ignoring a stand-in offered to production', () => {
    expect(() =>
      selectAiService({ variant: 'production', serviceForTests: createFixtureAiService() }),
    ).toThrow(ProductionAiSubstitutionError);
  });

  it('gives the test variant the unavailable assistant too, unless one is passed in', async () => {
    const defaulted = selectAiService({ variant: 'test' });
    const supplied = selectAiService({ variant: 'test', serviceForTests: createFixtureAiService() });

    expect((await defaulted.extractCook(CONTEXT)).available).toBe(false);
    expect((await supplied.extractCook(CONTEXT)).available).toBe(true);
  });

  it('keeps the only stand-in that exists outside everything the bundler compiles', () => {
    const root = resolve(__dirname, '..');
    const found: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          found.push(path);
        }
      }
    };
    walk(join(root, 'src'));
    walk(join(root, 'app'));

    // `__tests__/fixtureSeparation.test.ts` proves nothing bundled imports the
    // test tree. This proves the other half: the stand-in is not in the bundle
    // under another name.
    const offenders = found.filter((file) => /createFixtureAiService|FIXTURE_AI/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => relative(root, file))).toEqual([]);
    expect(found.length).toBeGreaterThan(5);
  });
});

describe('a candidate from an assistant still has to go through the controlled path', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await openTestDatabase('ai-candidates.db');
    granted(
      await db.data.capture.startCook({ id: 'cook-01', startedAt: T0 }, 'user', T0),
    );
    granted(
      await db.data.capture.addEvent(
        { id: 'event-01', cookId: 'cook-01', ts: T0, kind: 'user_note', body: 'Lid on.' },
        'user',
      ),
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('turns an assistant candidate into a proposal and nothing more', async () => {
    const assistant: AiService = createFixtureAiService();
    const cook = await db.data.cooks.findById('cook-01');
    const events = await db.data.cookEvents.listForCook({ cookId: 'cook-01' });
    expect(cook).not.toBeNull();
    if (cook === null) {
      return;
    }

    const outcome = await assistant.extractCook({ cook, events });
    expect(outcome.available).toBe(true);
    if (!outcome.available) {
      return;
    }

    // The candidate has no status and no author of its own; both are decided
    // here, by code the assistant does not run.
    const candidate = outcome.result.findings[0];
    expect(candidate).toBeDefined();
    expect(candidate).not.toHaveProperty('status');
    if (candidate === undefined) {
      return;
    }

    const applied = granted(
      await db.data.review.proposeFinding(candidate, { id: 'finding-01' }, 'ai', T2),
    );

    expect(applied.finding.status).toBe('proposed');
    expect(applied.finding.createdBy).toBe('ai');
    expect(await db.data.findings.list({ status: 'approved' })).toEqual([]);
  });

  it('leaves the timeline and the verdict untouched no matter what the assistant returned', async () => {
    const assistant = createFixtureAiService();
    const cook = await db.data.cooks.findById('cook-01');
    if (cook === null) {
      return;
    }

    await assistant.extractCook({ cook, events: [] });
    await assistant.chat({ context: { cook, events: [] }, history: [], message: 'hello' });

    expect((await db.data.cooks.findById('cook-01'))?.verdict).toBeNull();
    expect((await db.data.cookEvents.listForCook({ cookId: 'cook-01' })).map((e) => e.body)).toEqual([
      'Lid on.',
    ]);
  });
});
