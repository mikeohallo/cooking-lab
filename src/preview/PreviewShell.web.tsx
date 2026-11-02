/**
 * The web preview around the app (0.4.0, part 7). Web only.
 *
 * The root layout hands its whole tree to this on the web, and only there.
 * It applies `?theme=`; and with `?screen=` it draws that one screen, on the
 * same providers and gates the root layout uses, in place of the app's
 * navigator, then runs the screen's steps on the page. Without `?screen=` the
 * app runs as usual, from Home, on the preview notebook.
 */

import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { newDeviceId } from '../data/native/expoCrypto';
import { initialiseStorage } from '../data/startup';
import { FontGate } from '../state/FontGate';
import { PendingDeletionProvider } from '../state/PendingDeletion';
import { StartupGate } from '../state/StartupGate';
import { StorageProvider } from '../state/StorageProvider';
import { ThemeOverride, useColors } from '../theme/theme';
import { carriedQuery, currentPreviewOptions, type PreviewOptions } from './options.web';
import {
  PREVIEW_PLANS,
  PreviewScreenView,
  PreviewSteps,
  type PreviewPerformer,
} from './PreviewScreen.web';

const WAIT_MS = 10_000;
const POLL_MS = 100;

/** The element with this test id, once it is on the page. */
async function element(testID: string): Promise<HTMLElement> {
  const started = Date.now();
  for (;;) {
    const found = document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(testID)}"]`);
    if (found !== null) {
      return found;
    }
    if (Date.now() - started > WAIT_MS) {
      throw new Error(`nothing on the page has the test id ${testID}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** A tap or typing, done on the page as a person would. */
const performOnPage: PreviewPerformer = async (step) => {
  const target = await element(step.testID);
  if (step.kind === 'press') {
    target.click();
    return;
  }
  const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    ? target
    : target.querySelector('input, textarea');
  if (input === null) {
    throw new Error(`${step.testID} is not a text field`);
  }
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, step.text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

function reportDone(problem: string | null): void {
  if (problem !== null) {
    console.warn(`The preview could not reach its screen: ${problem}`);
  }
  document.body.dataset.previewReady = problem === null ? 'yes' : 'failed';
}

function Page({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.page, { backgroundColor: colors.page }]}>{children}</View>;
}

/** One screen, alone, on the root layout's own providers and gates. */
function PreviewScreenApp({ options }: { options: PreviewOptions }) {
  const plan = PREVIEW_PLANS[options.screen ?? 'home'];
  const go = useMemo(() => {
    const query = carriedQuery(options);
    return (path: string) => window.location.assign(`${path}${query}`);
  }, [options]);
  return (
    <SafeAreaProvider>
      <StorageProvider start={initialiseStorage} newId={newDeviceId}>
        <PendingDeletionProvider>
          <Page>
            <FontGate>
              <StartupGate>
                <PreviewScreenView view={plan.view} go={go} />
                <PreviewSteps steps={plan.steps} perform={performOnPage} onDone={reportDone} />
              </StartupGate>
            </FontGate>
          </Page>
        </PendingDeletionProvider>
      </StorageProvider>
    </SafeAreaProvider>
  );
}

export function PreviewShell({ children }: { children: ReactNode }) {
  const options = useMemo(() => currentPreviewOptions(), []);
  const body = options.screen === null ? children : <PreviewScreenApp options={options} />;
  return options.theme === null ? body : <ThemeOverride scheme={options.theme}>{body}</ThemeOverride>;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
});
