/**
 * A deterministic assistant, for tests only.
 *
 * It lives here, in the test tree, and not under `src/`, because that is the
 * only placement that makes "the production build cannot select it" a fact
 * rather than a promise: the bundler compiles `app/` and `src/`, nothing in
 * either imports anything from `__tests__/`, and
 * `__tests__/fixtureSeparation.test.ts` walks every bundled file and proves it.
 *
 * What it returns is fixed and obviously not real cooking advice. It exists so
 * that a test can exercise the path a candidate travels — assistant to
 * candidate to proposal to decision — without any of the tests having to guess
 * what a real assistant would say.
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
} from '../../src/data/adapters';
import type { AiCandidateSet } from '../../src/domain/evidence';

/** Everything this assistant says begins with this, so it cannot be mistaken for real advice. */
export const FIXTURE_AI_MARKER = 'test-only assistant:';

export function createFixtureAiService(): AiService {
  return {
    async extractCook(context: AiReviewContext): Promise<AiOutcome<AiCandidateSet>> {
      const firstEvent = context.events[0];
      return {
        available: true,
        result: {
          findings:
            firstEvent === undefined
              ? []
              : [
                  {
                    cookId: context.cook.id,
                    class: 'inference',
                    text: `${FIXTURE_AI_MARKER} something was read out of the timeline`,
                    rationale: null,
                    confidence: 'low',
                    sourceEventIds: [firstEvent.id],
                  },
                ],
          lessons: [
            { cookId: context.cook.id, text: `${FIXTURE_AI_MARKER} advice for next time` },
          ],
        },
      };
    },

    async createBriefing(request: AiBriefingRequest): Promise<AiOutcome<AiBriefingDraft>> {
      return {
        available: true,
        result: {
          content: { note: `${FIXTURE_AI_MARKER} a briefing` },
          sourceCookIds: request.sourceCooks.map((source) => source.cook.id),
        },
      };
    },

    async chat(request: AiChatRequest): Promise<AiOutcome<AiChatReply>> {
      return {
        available: true,
        result: { text: `${FIXTURE_AI_MARKER} ${request.message}` },
      };
    },

    async importCandidates(request: AiImportRequest): Promise<AiOutcome<AiImportResult>> {
      return {
        available: true,
        result: {
          batchId: request.batchId,
          candidates: [
            { title: `${FIXTURE_AI_MARKER} a cook from a document`, startedAt: null, events: [] },
          ],
        },
      };
    },
  };
}
