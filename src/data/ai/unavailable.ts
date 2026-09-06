/**
 * The assistant, as it exists in this milestone: not connected.
 *
 * Every operation answers `ai_not_connected` and returns no content. That is
 * the honest state of the app today, and saying so is the entire job of this
 * module.
 *
 * WHY NOT A HELPFUL STUB
 * ----------------------
 * A stub that returned a plausible finding, a sample briefing or a friendly
 * chat reply would type-check, pass a suite, demo well, and be
 * indistinguishable in code review from a real assistant. It would also put
 * invented claims in front of the cook and file them next to things that
 * actually happened, which is the one failure this product cannot recover
 * from — a notebook you cannot trust is not a notebook. So this implementation
 * fabricates nothing: no findings, no lessons, no briefings, no replies and no
 * import candidates.
 *
 * Note what it does not have. No constructor argument, no captured variable, no
 * property of any kind: there is nothing in this object but four functions and
 * therefore nothing in it that could be a database. `findDatabaseHandles` in
 * `src/data/adapters.ts` proves that at runtime, and the test suite runs it
 * against this very object.
 *
 * A real implementation begins at M3. It will be a different file, and it will
 * still receive no database handle.
 */

import type {
  AiBriefingDraft,
  AiBriefingRequest,
  AiChatReply,
  AiChatRequest,
  AiImportRequest,
  AiImportResult,
  AiOutcome,
  AiReviewContext,
  AiService,
} from '../adapters';
import type { AiCandidateSet } from '../../domain/evidence';

/** The one thing this build has to say about the assistant. */
export const AI_NOT_CONNECTED_MESSAGE =
  'Cooking Lab is not connected to an assistant yet, so there is nothing to show here.';

function notConnected<T>(): AiOutcome<T> {
  return {
    available: false,
    reason: 'ai_not_connected',
    message: AI_NOT_CONNECTED_MESSAGE,
  };
}

/**
 * The production assistant for M1.
 *
 * The parameters are named and ignored on purpose: the shape of what the app
 * would send is already fixed and reviewable, and the fact that nothing is done
 * with it is the point.
 */
export function createUnavailableAiService(): AiService {
  return {
    async extractCook(_context: AiReviewContext): Promise<AiOutcome<AiCandidateSet>> {
      return notConnected();
    },
    async createBriefing(_request: AiBriefingRequest): Promise<AiOutcome<AiBriefingDraft>> {
      return notConnected();
    },
    async chat(_request: AiChatRequest): Promise<AiOutcome<AiChatReply>> {
      return notConnected();
    },
    async importCandidates(_request: AiImportRequest): Promise<AiOutcome<AiImportResult>> {
      return notConnected();
    },
  };
}
