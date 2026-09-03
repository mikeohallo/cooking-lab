/**
 * Cooking Lab product language. Kept in one place so the shell, the tests and
 * later milestones all speak with the same voice.
 */

export const PRODUCT_TAGLINE =
  'A private cooking notebook for one kitchen. Everything stays on this device.';

export const CORE_LOOP_INTRO = 'Cooking Lab follows one loop:';

export const CORE_LOOP_STEPS = [
  'Cook',
  'Observe',
  'Review',
  'Learn',
  'Cook Again',
] as const;

export const CORE_LOOP_SUMMARY =
  'Every cook becomes evidence. Every review turns evidence into something you can use next time.';

export const MILESTONE_NOTE =
  'Milestone 0 is the application shell only. Nothing is saved yet.';

export const NEW_COOK_TITLE = 'New Cook';
export const NEW_COOK_BODY =
  'Cook capture is not implemented in Milestone 0. Recording a cook — temperatures, timings, observations and photos — arrives in a later milestone.';

export const HISTORY_TITLE = 'History';
export const HISTORY_BODY =
  'History is not implemented in Milestone 0. On-device storage of past cooks and their reviews begins in a later milestone.';

export const BACK_TO_HOME = 'Back to Home';

export const TEST_BUILD_NOTICE =
  'This is the Cooking Lab TEST build. It is installed alongside the real app and holds no real cooking data.';
