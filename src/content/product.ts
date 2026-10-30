/**
 * Cooking Lab product language. Kept in one place so the screens, the tests
 * and later milestones all speak with the same voice.
 *
 * Sentence case throughout; British spelling; Celsius. Nothing here promises
 * a feature the current milestone does not have.
 */

export const PRODUCT_TAGLINE =
  'A private cooking notebook for one kitchen. Stored on this device. Nothing you write is lost, and you choose what to export or share.';

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
export const ADD_OVEN_READING = 'Oven °C';
export const ADD_INTERNAL_READING = 'Internal °C';
/** The way out to the free-text form, for a reading taken neither place. */
export const READING_SOMEWHERE_ELSE = 'Somewhere else?';
export const OVEN_READING_LABEL = 'Oven';
/** "Internal", never "Inside": one is the food's temperature, the other a room. */
export const INTERNAL_READING_LABEL = 'Internal';
export const TEMPERATURE_PLACEHOLDER = '°C';
export const TEMPERATURE_WHERE_PLACEHOLDER = 'Where? (optional)';
export const SAVE_TEMPERATURE = 'Add reading';
export const CANCEL = 'Cancel';
export const FINISH_AND_REVIEW = 'Finish & review';
export const EMPTY_TIMELINE_TITLE = 'Nothing noted yet';
export const EMPTY_TIMELINE_BODY =
  'Say what is happening below. One line is plenty. Readings and photos get their own cards.';
export const EDIT_TITLE = 'Edit title';
export const SAVE_TITLE = 'Save title';

// --- Photos ---------------------------------------------------------------

export const ADD_PHOTO = 'Add photo';
export const TAKE_PHOTO = 'Take photo';
export const CHOOSE_PHOTO = 'Choose from photos';
export const PHOTO_LABEL = 'Photo';
export const PHOTO_ALT = 'Photo from this cook';
export const VIEW_PHOTO = 'View photo';
export const CLOSE_PHOTO = 'Close';
export const PHOTO_MISSING = 'This photo is no longer on the phone.';
export const REMOVE_PHOTO = 'Remove photo';
export const REMOVE_PHOTO_CONFIRM_TITLE = 'Remove this photo?';
export const REMOVE_PHOTO_CONFIRM_BODY =
  'The picture and its file are deleted from this phone. Everything else about this cook stays exactly as it is.';
export const REMOVE_PHOTO_CONFIRM = 'Remove it';
export const REMOVE_PHOTO_KEEP = 'Keep it';
export const PHOTO_CAMERA_DENIED_TITLE = 'Cooking Lab has no camera access';
export const PHOTO_CAMERA_DENIED_BODY =
  'Android has not given the camera to this app. You can still choose a picture you have already taken.';
export const PHOTO_CAMERA_BLOCKED_BODY =
  'Camera access was turned off for this app. Android Settings → Apps → Cooking Lab → Permissions can turn it back on. You can still choose a picture you have already taken.';
export const PHOTO_FAILED_TITLE = 'The photo was not added';
export const PHOTO_FAILED_BODY = 'Nothing was changed in this cook. Try again in a moment.';

// --- Tags -----------------------------------------------------------------

export const TAGS_LABEL = 'Tags';
export const ADD_TAG_PLACEHOLDER = 'Add a tag…';
export const ADD_TAG = 'Add tag';
export const USED_BEFORE = 'Used before:';
export const SHOW_MY_TAGS = 'Show me my tags';
export const HIDE_MY_TAGS = 'Hide my tags';
export const NO_TAGS_YET =
  'No tags yet. A tag is your own word for a cook — “pork chops”, “brown butter” — and you can add as many as you like.';
export const REMOVE_TAG = 'Remove';
export const TAG_FAILED_TITLE = 'That tag was not saved';

// --- Search ---------------------------------------------------------------

export const SEARCH_PLACEHOLDER = 'Search tags or titles';
/**
 * The two result groups: everything that matched every word he typed, then
 * everything that matched part of it.
 *
 * "All" and "Some" on their own would be the obvious names, and "All" is
 * already on this screen — it is the first of the All / Open / Reviewed
 * filters, sitting a few millimetres above. One word meaning two things in one
 * eyeful is how a person ends up thinking the search changed their filter.
 */
export const SEARCH_GROUP_ALL = 'All your words';
export const SEARCH_GROUP_SOME = 'Some of your words';
export const SEARCH_NO_RESULTS_TITLE = 'Nothing matched';
export const SEARCH_NO_RESULTS_BODY =
  'No cook has those words in its title or its tags. Try one word, or tap a tag below.';
export const CLEAR_SEARCH = 'Clear search';

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
export const EMPTY_HISTORY_BODY =
  'Every cook you record will be listed here, newest first, and you can search them by title or tag.';
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
  'Nothing was changed. It may have been deleted, or the link is stale. Go back to Home to continue.';
export const BACK_TO_HOME = 'Back to Home';
export const RETRY = 'Try again';
export const UNSAVED_KEPT = 'Your text is still here. Nothing was lost.';

// --- Deleting a cook (0.2.2) ----------------------------------------------

export const DELETE_COOK = 'Delete cook';
export const DELETE_COOK_CONFIRM_TITLE = 'Delete this cook?';
export const DELETE_COOK_CONFIRM_BODY = 'Its notes, readings and photos go too.';
export const DELETE_COOK_CONFIRM = 'Delete';
export const DELETE_COOK_KEEP = 'Keep it';
export const COOK_DELETED = 'Cook deleted';
export const UNDO = 'Undo';
export const MORE_COOK_ACTIONS = 'More actions for this cook';
export const COOK_ACTIONS_CANCEL = 'Cancel';
export const DELETE_FAILED_TITLE = 'This cook was not deleted';

// --- Editing (0.2.2) -------------------------------------------------------

export const EDIT = 'Edit';
export const EDIT_NOTE = 'Edit note';
export const EDIT_VERDICT = 'Edit verdict';
export const SAVE_EDIT = 'Save';
export const EDITED = 'edited';
export const NOTE_ACTIONS = 'More actions for this note';
export const VERDICT_ACTIONS = 'More actions for the verdict';
export const EARLIER_VERSIONS = 'Earlier versions';
export const ORIGINAL_VERSION = 'Original';
export const CLOSE_VERSIONS = 'Close';
export const EDIT_UNCHANGED = 'Nothing has changed yet.';

// --- Keeping the screen on (0.2.2) ----------------------------------------

export const SCREEN_STAYS_ON = 'Screen stays on';
export const SCREEN_CAN_SLEEP = 'Screen can sleep';

// --- Photos placed by when they were taken (0.2.2) -----------------------

/** A photo placed at the time it was added, because its own time was missing or out of range. */
export const PHOTO_ADDED_AT = 'added';
