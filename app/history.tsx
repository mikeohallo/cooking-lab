import { Redirect } from 'expo-router';

/**
 * History is Home now (0.3.0): the search, the filters and every reviewed
 * cook, ten to a page. An old link or a back stack that still names
 * `/history` lands there instead of on a screen that no longer exists.
 */
export default function HistoryRoute() {
  return <Redirect href="/" />;
}
