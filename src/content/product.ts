/**
 * Cooking Lab product language. Kept in one place so the screens, the tests
 * and later milestones all speak with the same voice.
 *
 * Sentence case throughout; British spelling; Celsius. Nothing here promises
 * a feature the current milestone does not have.
 */

export const PRODUCT_TAGLINE =
  'A private cooking notebook for one kitchen. Everything stays on this device.';

export const CORE_LOOP_STEPS = ['Cook', 'Observe', 'Review', 'Learn', 'Cook Again'] as const;

export const TEST_BUILD_NOTICE =
  'This is the Cooking Lab TEST build. It is installed alongside the real app and holds no real cooking data.';

// --- Home -----------------------------------------------------------------

export const NEW_COOK_TITLE = 'New Cook';
export const NEW_COOK_HINT = 'Start now. Add a title later, or never.';
export const HISTORY_TITLE = 'History';
export const SEE_ALL_HISTORY = 'See all history';
export const CONTINUE_COOKING = 'Continue cooking';
export const RECENT_COOKS = 'Recent cooks';
export const EMPTY_HOME_TITLE = 'Nothing cooked yet';
export const EMPTY_HOME_BODY =
  'A cook can be as small as one sentence. Tap New Cook, say what happened, and come back to it after dinner.';

// --- Cook ----------------------------------------------------------------

export const UNTITLED_COOK = 'Untitled cook';
export const COOK_TITLE_PLACEHOLDER = 'Name this cook (optional)';
export const NOTE_PLACEHOLDER = 'What’s happening?';
export const SEND_NOTE = 'Send';
export const ADD_TEMPERATURE = 'Temperature';
export const TEMPERATURE_PLACEHOLDER = '°C';
export const TEMPERATURE_WHERE_PLACEHOLDER = 'Where? (optional)';
export const SAVE_TEMPERATURE = 'Add reading';
export const CANCEL = 'Cancel';
export const FINISH_AND_REVIEW = 'Finish & review';
export const EMPTY_TIMELINE_TITLE = 'Nothing noted yet';
export const EMPTY_TIMELINE_BODY =
  'Say what is happening below. One line is plenty. Temperatures get their own card.';
export const EDIT_TITLE = 'Edit title';
export const SAVE_TITLE = 'Save title';

// --- Review ---------------------------------------------------------------

export const REVIEW_TITLE = 'Review';
export const REVIEW_PROMPT = 'How was it?';
export const VERDICT_PLACEHOLDER = 'Say it the way you would tell someone at the table.';
export const FINISH_REVIEW = 'Finish review';
export const RAW_EVIDENCE = 'Raw evidence';
export const SUGGESTIONS = 'Suggestions';
export const AI_NOT_CONNECTED_TITLE = 'AI suggestions aren’t connected yet';
export const AI_NOT_CONNECTED_BODY =
  'Your verdict is the record. Suggestions arrive in a later version; nothing is missing from this cook.';
export const TAKEAWAY_LABEL = 'One thing to change next time (optional)';
export const TAKEAWAY_PLACEHOLDER = 'Pull it earlier. More acid. Keep the tray.';
export const REVIEW_SAVED_TITLE = 'Reviewed';

// --- Export ---------------------------------------------------------------

export const EXPORT_EVERYTHING = 'Export everything';
export const EXPORT_EVERYTHING_HINT =
  'Every cook as one file you can keep anywhere. Nothing in the app changes.';
export const EXPORT_COOK = 'Export this cook';
export const EXPORT_COOK_HINT = 'As a text file you can read, send or keep.';
export const EXPORT_DONE_TITLE = 'Export ready';
export const EXPORT_FAILED_TITLE = 'Nothing was exported';
export const EXPORT_FAILED_BODY = 'Your cooks are unchanged. Try again in a moment.';

// --- History --------------------------------------------------------------

export const FILTER_ALL = 'All';
export const FILTER_OPEN = 'Open';
export const FILTER_REVIEWED = 'Reviewed';
export const EMPTY_HISTORY_TITLE = 'No cooks yet';
export const EMPTY_HISTORY_BODY = 'Every cook you record will be listed here, newest first.';
export const EMPTY_OPEN_TITLE = 'No open cooks';
export const EMPTY_OPEN_BODY = 'Every cook here has been reviewed. Start a new one from Home.';
export const EMPTY_REVIEWED_TITLE = 'Nothing reviewed yet';
export const EMPTY_REVIEWED_BODY =
  'Finish a cook and say how it went, and it will be listed here.';
export const STATUS_OPEN = 'Open';
export const STATUS_REVIEWED = 'Reviewed';

// --- Safe states ----------------------------------------------------------

export const STARTING_TITLE = 'Opening your notebook';
export const COOK_NOT_FOUND_TITLE = 'That cook isn’t here';
export const COOK_NOT_FOUND_BODY =
  'Nothing was changed. It may have been removed, or the link is stale. Go back to Home to continue.';
export const BACK_TO_HOME = 'Back to Home';
export const RETRY = 'Try again';
export const UNSAVED_KEPT = 'Your text is still here. Nothing was lost.';
