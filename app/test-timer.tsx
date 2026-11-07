import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AppText } from '../src/components/AppText';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { isTestBuild } from '../src/config/appIdentity';
import type { CookId } from '../src/domain/entities';
import { isEntityId } from '../src/domain/invariants';
import { useStorage } from '../src/state/StorageProvider';
import { useTimers } from '../src/state/Timers';

/** The longest timer the link starts: a day. */
const MAX_SECONDS = 24 * 60 * 60;
const MAX_NAME = 40;

/** Pure: the link's parameters, checked, or why they were refused. */
export type TestTimerLink =
  | { action: 'start'; cook: CookId; title: string | null; name: string; seconds: number }
  | { action: 'stop'; cook: CookId };

export function readTestTimerLink(params: {
  cook?: string;
  title?: string;
  name?: string;
  seconds?: string;
  stop?: string;
}): TestTimerLink | { problem: string } {
  const { cook, title, name, seconds, stop } = params;
  if (!isEntityId(cook)) {
    return { problem: 'cook must be an id: lower-case letters, digits and dashes.' };
  }
  if (stop !== undefined) {
    return stop === 'all' ? { action: 'stop', cook: cook as CookId } : { problem: 'stop must be all.' };
  }
  const trimmed = (name ?? '').trim();
  if (trimmed === '' || trimmed.length > MAX_NAME) {
    return { problem: `name must be 1 to ${MAX_NAME} characters.` };
  }
  const count = Number(seconds);
  if (!Number.isInteger(count) || count < 1 || count > MAX_SECONDS) {
    return { problem: `seconds must be a whole number from 1 to ${MAX_SECONDS}.` };
  }
  const wanted = (title ?? '').trim();
  return { action: 'start', cook: cook as CookId, title: wanted === '' ? null : wanted, name: trimmed, seconds: count };
}

/**
 * TEST builds only (0.5.0 fixes): a link that starts a named timer of an
 * exact length, so a scripted device test never has to tap through the New
 * timer sheet while other timers tick (on 6 Nov those taps hit the wrong
 * controls and gave uneven lengths).
 *
 *   cookinglab://test-timer?cook=<id>&name=Meat&seconds=60
 *   cookinglab://test-timer?cook=<id>&title=Script%20cook&name=Meat&seconds=60
 *
 *   cookinglab://test-timer?cook=<id>&stop=all
 *
 * With `title`, a cook with that id is started first if there is none. Then
 * the timer starts through the same path as the sheet, and the cook's page
 * opens. `stop=all` stops every timer on that cook (running, paused or
 * ringing), as Stop does, and opens the cook's page. In the production app this route does nothing but go Home: it never
 * reads its parameters or touches the notebook.
 */
export default function TestTimerRoute() {
  if (!isTestBuild()) {
    return <Redirect href="/" />;
  }
  return <TestTimer />;
}

function TestTimer() {
  const router = useRouter();
  const storage = useStorage();
  const timers = useTimers();
  const params = useLocalSearchParams<{ cook?: string; title?: string; name?: string; seconds?: string; stop?: string }>();
  const [failure, setFailure] = useState<string | null>(null);
  const done = useRef(false);
  const link = useMemo(
    () =>
      readTestTimerLink({ cook: params.cook, title: params.title, name: params.name, seconds: params.seconds, stop: params.stop }),
    [params.cook, params.title, params.name, params.seconds, params.stop],
  );

  useEffect(() => {
    if (done.current || !timers.ready || 'problem' in link) {
      return;
    }
    done.current = true;
    void (async () => {
      if (link.action === 'stop') {
        for (const timer of timers.forCook(link.cook)) {
          const failed = await timers.stop(timer.id);
          if (failed !== null) {
            setFailure(failed);
            return;
          }
        }
        router.replace(`/cook/${link.cook}`);
        return;
      }
      const found = await storage.data.cooks.findById(link.cook);
      if (found === null) {
        if (link.title === null) {
          setFailure(`No cook ${link.cook}; add title= to start one.`);
          return;
        }
        const at = storage.now();
        const started = await storage.data.capture.startCook({ id: link.cook, title: link.title, startedAt: at }, 'user', at);
        if (!started.allowed) {
          setFailure(started.message);
          return;
        }
      }
      const failed = await timers.start(link.cook, link.name, link.seconds / 60);
      if (failed !== null) {
        setFailure(failed);
        return;
      }
      router.replace(`/cook/${link.cook}`);
    })();
  }, [link, router, storage, timers]);

  const problem = 'problem' in link ? link.problem : failure;
  return (
    <ScreenContainer>
      <AppText variant="secondary" tone={problem ? 'danger' : 'inkMuted'} testID="test-timer-status">
        {problem ?? 'Working on the timer link…'}
      </AppText>
    </ScreenContainer>
  );
}
