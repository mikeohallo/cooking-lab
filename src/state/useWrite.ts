/**
 * Explicit pending / success / failure state around a write.
 *
 * Every write a screen makes goes through one of these, which is what makes
 * the baseline's rule enforceable: a screen can only show evidence as saved
 * once the promise has actually resolved, and a failure is a value the screen
 * must render rather than an exception it might forget.
 *
 * An evidence refusal (`allowed: false`) and a thrown storage error arrive as
 * the same `failed` state with a human-readable message, because the person
 * holding the phone needs the same two things from either: their text is
 * still there, and here is what to do.
 */

import { useCallback, useRef, useState } from 'react';

import type { EvidenceDecision } from '../domain/evidence';

export type WriteState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly message: string };

export type WriteResult<T> = { readonly ok: true; readonly record: T } | { readonly ok: false };

export function useWrite(): {
  state: WriteState;
  /** Runs the write, publishing pending/failed state around it. */
  run<T>(write: () => Promise<EvidenceDecision<T>>): Promise<WriteResult<T>>;
  reset(): void;
} {
  const [state, setState] = useState<WriteState>({ status: 'idle' });
  const inFlight = useRef(false);

  const run = useCallback(async <T,>(write: () => Promise<EvidenceDecision<T>>) => {
    if (inFlight.current) {
      return { ok: false } as const;
    }
    inFlight.current = true;
    setState({ status: 'pending' });
    try {
      const decision = await write();
      if (decision.allowed) {
        setState({ status: 'idle' });
        return { ok: true, record: decision.record } as const;
      }
      setState({ status: 'failed', message: decision.message });
      return { ok: false } as const;
    } catch (cause: unknown) {
      setState({
        status: 'failed',
        message: cause instanceof Error ? cause.message : String(cause),
      });
      return { ok: false } as const;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, run, reset };
}
