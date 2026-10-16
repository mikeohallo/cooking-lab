import { StateNotice } from '../components/StateNotice';
import { EXPORT_DONE_TITLE, EXPORT_FAILED_BODY, EXPORT_FAILED_TITLE } from '../content/product';
import type { ExportState } from '../state/useExport';

type ExportNoticeProps = {
  state: ExportState;
  testID: string;
};

/**
 * What an export has to say for itself: the file it made, or why there is
 * none. Idle and pending render nothing — the button carries pending.
 */
export function ExportNotice({ state, testID }: ExportNoticeProps) {
  if (state.status === 'done') {
    return <StateNotice title={EXPORT_DONE_TITLE} body={state.summary} testID={`${testID}-done`} />;
  }
  if (state.status === 'failed') {
    return (
      <StateNotice
        title={EXPORT_FAILED_TITLE}
        body={`${state.message} ${EXPORT_FAILED_BODY}`}
        tone="problem"
        testID={`${testID}-failed`}
      />
    );
  }
  return null;
}
