/**
 * Explicit state around an export, the way `useWrite` wraps a write.
 *
 * An export is not a write — nothing in the store changes — but a screen
 * needs the same honesty about it: a button that shows pending while the
 * share sheet is up, a failure that is rendered with its reason, and a
 * "done" that names the file rather than implying the person's copy is
 * somewhere the app knows about. It is not; the share sheet took it.
 */

import { useCallback, useRef, useState } from 'react';

import type { ExportOutcome } from '../data/export/service';

export type ExportState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'done'; readonly fileName: string; readonly summary: string }
  | { readonly status: 'failed'; readonly message: string };

export function useExport(): {
  state: ExportState;
  /** Runs the export, publishing pending / done / failed state around it. */
  run(exportNow: () => Promise<ExportOutcome>): Promise<ExportOutcome>;
  reset(): void;
} {
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const inFlight = useRef(false);

  const run = useCallback(async (exportNow: () => Promise<ExportOutcome>) => {
    if (inFlight.current) {
      return { ok: false, message: 'An export is already in progress.' } as const;
    }
    inFlight.current = true;
    setState({ status: 'pending' });
    try {
      const outcome = await exportNow();
      setState(
        outcome.ok
          ? { status: 'done', fileName: outcome.fileName, summary: outcome.summary }
          : { status: 'failed', message: outcome.message },
      );
      return outcome;
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setState({ status: 'failed', message });
      return { ok: false, message } as const;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, run, reset };
}
