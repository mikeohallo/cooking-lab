/**
 * Choosing which assistant the app runs on.
 *
 * There is one production implementation and it is
 * `createUnavailableAiService`. This module exists so that the sentence "the
 * production build cannot end up with a stand-in assistant" is enforced by code
 * rather than by everybody remembering it.
 *
 * HOW A STAND-IN IS KEPT OUT
 * --------------------------
 * Three separate things have to be true at once for a fabricating assistant to
 * reach a cook, and each of them is false:
 *
 *   1. Nothing under `src/` or `app/` contains one. The only implementation in
 *      the shipped source refuses every request.
 *   2. Nothing the bundler compiles imports anything from the test tree, which
 *      is where a deterministic stand-in for tests would live.
 *      `__tests__/fixtureSeparation.test.ts` walks every bundled file and
 *      asserts it.
 *   3. Even given one, `selectAiService` refuses to install it in the
 *      production variant. It throws rather than quietly ignoring it, because a
 *      caller that reached for a stand-in in production has misunderstood
 *      something, and the failure should be loud enough to notice.
 *
 * `variant` comes from `extra.appVariant`, which `app.config.ts` stamps into
 * the build; production and test are different Android application ids and
 * therefore different installations.
 */

import type { AiService } from '../adapters';
import type { AppVariant } from '../../config/variants';
import { createUnavailableAiService } from './unavailable';

export type AiSelection = {
  readonly variant: AppVariant;
  /**
   * An assistant supplied by a test.
   *
   * Refused outright in the production variant. Nothing in the shipped source
   * passes it, and nothing in the shipped source has anything to pass.
   */
  readonly serviceForTests?: AiService;
};

export class ProductionAiSubstitutionError extends Error {
  constructor() {
    super('the production build has no assistant to substitute and will not accept one');
    this.name = 'ProductionAiSubstitutionError';
  }
}

/**
 * The assistant this build uses.
 *
 * Production always gets the unavailable one, because in this milestone that is
 * the only true answer.
 */
export function selectAiService(selection: AiSelection): AiService {
  if (selection.variant === 'production') {
    if (selection.serviceForTests !== undefined) {
      throw new ProductionAiSubstitutionError();
    }
    return createUnavailableAiService();
  }
  return selection.serviceForTests ?? createUnavailableAiService();
}
