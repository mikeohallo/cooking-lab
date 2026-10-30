/**
 * Cooking Lab product language. Kept in one place so the screens, the tests
 * and later milestones all speak with the same voice.
 *
 * Sentence case throughout; British spelling; Celsius. Nothing here promises
 * a feature the current milestone does not have.
 *
 * As of 0.3.0: Home is also History — New Cook, Cooking now, the search and
 * its filters, and every reviewed cook ten to a page, with Export everything
 * and Who's eating in its ⋯ menu. A cook records its meal type, ingredients
 * and who ate it; Cook this again shows what was said last time. There is no
 * separate History screen, so nothing here names one.
 */

export const PRODUCT_TAGLINE =
  'A private cooking notebook for one kitchen. Stored on this device. Nothing you write is lost, and you choose what to export or share.';

export const CORE_LOOP_STEPS = ['Cook', 'Observe', 'Review', 'Learn', 'Cook Again'] as const;

export const TEST_BUILD_NOTICE =
  'This is the Cooking Lab TEST build. It is installed alongside the real app and holds no real cooking data.';

// --- Home -----------------------------------------------------------------

export const NEW_COOK_TITLE = 'New Cook';
export const NEW_COOK_HINT = 'Start now. Add a title later, or never.';
export const COOKING_NOW = 'Cooking now';
export const HOME_MORE = 'More: export everything, who’s eating';
export const PAGE_PREVIOUS = 'Previous';
export const PAGE_NEXT = 'Next';
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

export const SEARCH_PLACEHOLDER = 'Search titles, tags, ingredients';
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
  'No cook has those words in its title, its tags or its ingredients. Try one word, or tap a tag below.';
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

// --- History, which is Home since 0.3.0 -----------------------------------

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

// --- Update 2 (0.3.0) ------------------------------------------------------

/** The meal-type chips, in this order. */
export const MEAL_TYPE_CHIPS_LABEL = 'Meal type';
export const MEAL_TYPE_CLEAR_HINT = 'Tap the chosen one again to clear it.';

export const INGREDIENTS_TITLE = 'Ingredients';
export const INGREDIENTS_PLACEHOLDER = 'Type or paste them here, one per line.';
export const INGREDIENTS_SAVE = 'Save ingredients';
export const INGREDIENTS_EDIT = 'Edit';
export const INGREDIENTS_ADD = 'Add ingredients';
export const INGREDIENTS_EDIT_LABEL = 'Edit ingredients';
export const INGREDIENTS_NONE = 'None written down.';
export const INGREDIENTS_SHOW_LESS = 'Show less';
/** "Show all 12". */
export const ingredientsShowAll = (count: number): string => `Show all ${count}`;

export const WHO_ATE_IT = 'Who ate it?';
export const SOMEONE_ELSE = '+ Someone else';
export const GUEST_NAME_PLACEHOLDER = 'Their name';
export const ADD_GUEST = 'Add';
export const ADD_A_LINE = '+ Add a line';
export const RATING_LINE_PLACEHOLDER = 'A short line (optional)';
export const SAVE_LINE = 'Save line';
export const NOT_EATEN = 'N/A';
export const NOT_EATEN_LONG = 'Didn’t eat it';
export const GUEST_MARK = 'guest';
export const RATING_FAILED_TITLE = 'That rating was not saved';
/** TalkBack names for the star buttons. */
export const starsLabel = (stars: number): string => (stars === 1 ? '1 star' : `${stars} stars`);
export const NO_HOUSEHOLD_YET = 'Nobody is on the list yet.';

export const WHO_USUALLY_EATS = 'Who usually eats?';
export const WHO_USUALLY_EATS_BODY =
  'Add the people who usually eat, and each review will have a row for each of them. Kept on this phone. You can change it any time from Home.';
export const HOUSEHOLD_NAME_PLACEHOLDER = 'A name';
export const HOUSEHOLD_ADD = 'Add';
export const HOUSEHOLD_DONE = 'Done';
export const HOUSEHOLD_SKIP = 'Skip for now';
export const WHOS_EATING = 'Who’s eating';
export const WHOS_EATING_HINT = 'The people who usually eat, in order.';
export const MOVE_UP = 'Move up';
export const MOVE_DOWN = 'Move down';
export const RETIRE = 'No longer eats here';
export const RESTORE = 'Bring back';
export const RETIRED_HEADING = 'No longer eating here';
export const RETIRED_BODY = 'Their ratings stay on the cooks they rated.';

export const YOUR_NOTES = 'Your notes';
export const YOUR_NOTES_PLACEHOLDER = 'How was it? Say it the way you would tell someone at the table.';
export const EDIT_NOTES = 'Edit your notes';
export const NOTES_ACTIONS = 'More actions for your notes';
export const NO_NOTES = 'No notes were written for this cook.';
export const NEXT_TIME = 'Next time';
export const NEXT_TIME_HINT = 'Shown before you cook this again';
export const ADD_NEXT_TIME = '+ Add a next-time line';
export const SAVE_NEXT_TIME = 'Save';
export const EDIT_NEXT_TIME = 'Edit next-time line';
export const NEXT_TIME_ACTIONS = 'More actions for this next-time line';

export const COOK_THIS_AGAIN = 'Cook this again';
export const COOK_THIS_AGAIN_HINT = 'A new cook with the same title, tags, meal type and ingredients.';
export const LAST_TIME = 'Last time';
export const OPEN_LAST_TIME = 'Open';
export const LAST_TIME_NO_RATINGS = 'Nobody rated it.';

export const FILTER_MEAL_TYPE = 'Meal type';
export const WHO_AND_STARS = 'Who & stars';
export const WHO_AND_STARS_ANYONE = 'Anyone';
export const WHO_AND_STARS_PICK = 'Pick someone';
/** "at least 4 stars". */
export const atLeastStars = (stars: number): string =>
  stars === 1 ? 'at least 1 star' : `at least ${stars} stars`;
export const CLEAR_FILTERS = 'Clear filters';
export const FILTER_NO_RESULTS_TITLE = 'Nothing matches';
export const FILTER_NO_RESULTS_BODY = 'No cook matches those filters. Try fewer of them.';
