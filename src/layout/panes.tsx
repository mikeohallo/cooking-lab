/**
 * Sheets that stay inside their pane (0.3.0).
 *
 * On the unfolded inner display a screen can show two panes. A sheet, a
 * confirm or a photo opened from one of them belongs to that pane, and dims
 * and covers only that pane rather than the whole display. On one column — the
 * cover display — there is only one pane, and a sheet is an ordinary
 * full-screen `Modal`, exactly as before.
 *
 * Each pane's root is a `PaneOverlayHost`. It is always there, on one column
 * too, so that folding or unfolding never changes the shape of the tree above
 * a pane's contents and nothing in it is remounted — not the cook, not the
 * note half-typed in the composer. Only on two panes does it accept sheets.
 */

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { BackHandler, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

type PaneOverlay = {
  /** True on two panes: sheets are drawn over this pane only. */
  readonly enabled: boolean;
  show(id: string, node: ReactNode): void;
  hide(id: string): void;
};

const PaneOverlayContext = createContext<PaneOverlay | null>(null);

type PaneOverlayHostProps = {
  enabled: boolean;
  children: ReactNode;
  testID?: string;
};

export function PaneOverlayHost({ enabled, children, testID }: PaneOverlayHostProps) {
  const [overlays, setOverlays] = useState<readonly { id: string; node: ReactNode }[]>([]);
  const api = useMemo<Omit<PaneOverlay, 'enabled'>>(
    () => ({
      show(id, node) {
        setOverlays((now) =>
          now.some((overlay) => overlay.id === id)
            ? now.map((overlay) => (overlay.id === id ? { id, node } : overlay))
            : [...now, { id, node }],
        );
      },
      hide(id) {
        setOverlays((now) => (now.some((overlay) => overlay.id === id) ? now.filter((overlay) => overlay.id !== id) : now));
      },
    }),
    [],
  );
  const value = useMemo<PaneOverlay>(() => ({ enabled, ...api }), [enabled, api]);

  return (
    <PaneOverlayContext.Provider value={value}>
      <View style={styles.host} testID={testID}>
        {children}
        {enabled
          ? overlays.map((overlay) => (
              <View key={overlay.id} style={StyleSheet.absoluteFill} testID="pane-overlay">
                {overlay.node}
              </View>
            ))
          : null}
      </View>
    </PaneOverlayContext.Provider>
  );
}

const NO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

type PaneSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  /** `true` for a sheet over a dimmed screen; `false` for a page of its own (the photo). */
  transparent?: boolean;
  testID?: string;
  /**
   * The sheet's contents, given the insets to keep clear of: the device's own
   * on a full-screen `Modal`, none inside a pane, which already sits clear of
   * them.
   */
  children: (insets: EdgeInsets) => ReactNode;
};

/**
 * A full-screen `Modal` on one column; inside its pane on two. Android's Back
 * closes it either way.
 */
export function PaneSheet({ visible, onRequestClose, transparent = true, testID, children }: PaneSheetProps) {
  const host = useContext(PaneOverlayContext);
  const insets = useSafeAreaInsets();
  const id = useId();
  const inPane = host !== null && host.enabled;
  const content = inPane && visible ? (
    <View style={styles.inPane} testID={testID}>
      {children(NO_INSETS)}
    </View>
  ) : null;

  useEffect(() => {
    if (host === null) {
      return;
    }
    if (content === null) {
      host.hide(id);
    } else {
      host.show(id, content);
    }
  });

  useEffect(() => () => host?.hide(id), [host, id]);

  useEffect(() => {
    if (!inPane || !visible) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true;
    });
    return () => subscription.remove();
  }, [inPane, visible, onRequestClose]);

  if (inPane) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={transparent}
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
      navigationBarTranslucent
      testID={testID}
    >
      {visible ? children(insets) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  inPane: {
    flex: 1,
  },
});
