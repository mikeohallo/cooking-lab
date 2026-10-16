import { StyleSheet, View } from 'react-native';

import { useStorage } from '../state/StorageProvider';
import { useCookList, verdictExcerpt } from '../state/useCookList';
import { useExport } from '../state/useExport';
import { useWrite } from '../state/useWrite';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { CoreLoop } from '../components/CoreLoop';
import { ScreenContainer } from '../components/ScreenContainer';
import { ShellHeader } from '../components/ShellHeader';
import { StateNotice } from '../components/StateNotice';
import { StatusChip } from '../components/StatusChip';
import {
  CONTINUE_COOKING,
  EMPTY_HOME_BODY,
  EMPTY_HOME_TITLE,
  EXPORT_EVERYTHING,
  EXPORT_EVERYTHING_HINT,
  NEW_COOK_HINT,
  NEW_COOK_TITLE,
  PRODUCT_TAGLINE,
  RECENT_COOKS,
  SEE_ALL_HISTORY,
  STATUS_OPEN,
  UNSAVED_KEPT,
  UNTITLED_COOK,
} from '../content/product';
import type { Cook, CookId } from '../domain/entities';
import { formatDateTime } from '../format/dateTime';
import { space } from '../theme/tokens';
import { ExportNotice } from './ExportNotice';

const RECENT_LIMIT = 5;

type HomeScreenProps = {
  onOpenCook: (cookId: CookId) => void;
  onHistory: () => void;
  /** Bumped by the route when the screen regains focus, to reload. */
  refreshToken?: number;
};

/**
 * Home: start or resume a cook immediately, and see what was cooked recently.
 *
 * New Cook is one tap. It creates an open, live cook with no title through the
 * capture service and goes straight to it; there is no form. The loop and the
 * tagline appear only while there is nothing else to show.
 */
export function HomeScreen({ onOpenCook, onHistory, refreshToken = 0 }: HomeScreenProps) {
  const { data, exporter, newId, now } = useStorage();
  const open = useCookList({ status: 'open', sort: 'newest_first' }, refreshToken);
  const recent = useCookList(
    { status: 'reviewed', sort: 'newest_first', page: { limit: RECENT_LIMIT + 1 } },
    refreshToken,
  );
  const create = useWrite();
  const exportAll = useExport();

  const startCook = async () => {
    const result = await create.run(() =>
      data.capture.startCook({ id: newId(), startedAt: now() }, 'user', now()),
    );
    if (result.ok) {
      onOpenCook(result.record.id);
    }
  };

  const loaded = open.status === 'ready' && recent.status === 'ready';
  const isEmpty = loaded && open.cooks.length === 0 && recent.cooks.length === 0;
  const loadProblem =
    open.status === 'failed' ? open.message : recent.status === 'failed' ? recent.message : null;

  return (
    <ScreenContainer testID="home-screen">
      <ShellHeader subtitle={isEmpty ? PRODUCT_TAGLINE : undefined} />

      <ActionButton
        label={NEW_COOK_TITLE}
        hint={NEW_COOK_HINT}
        onPress={() => void startCook()}
        variant="primary"
        size="hero"
        pending={create.state.status === 'pending'}
        testID="new-cook"
      />
      {create.state.status === 'failed' ? (
        <StateNotice
          title={create.state.message}
          body="Nothing was created. Try again in a moment."
          tone="problem"
          testID="new-cook-failed"
        />
      ) : null}

      {loadProblem ? (
        <StateNotice
          title="Your cooks could not be listed"
          body={`${loadProblem} ${UNSAVED_KEPT}`}
          tone="problem"
        />
      ) : null}

      {isEmpty ? (
        <View style={styles.section}>
          <StateNotice title={EMPTY_HOME_TITLE} body={EMPTY_HOME_BODY} testID="home-empty" />
          <CoreLoop />
        </View>
      ) : null}

      {open.status === 'ready' && open.cooks.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="sectionTitle">{CONTINUE_COOKING}</AppText>
          {open.cooks.map((cook) => (
            <CookCard key={cook.id} cook={cook} onPress={() => onOpenCook(cook.id)} />
          ))}
        </View>
      ) : null}

      {recent.status === 'ready' && recent.cooks.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="sectionTitle">{RECENT_COOKS}</AppText>
          {recent.cooks.slice(0, RECENT_LIMIT).map((cook) => (
            <CookCard key={cook.id} cook={cook} onPress={() => onOpenCook(cook.id)} />
          ))}
        </View>
      ) : null}

      <ActionButton
        label={SEE_ALL_HISTORY}
        onPress={onHistory}
        variant="secondary"
        testID="see-history"
        style={styles.history}
      />

      {loaded && !isEmpty ? (
        <View style={styles.section} testID="export-section">
          <ActionButton
            label={EXPORT_EVERYTHING}
            hint={EXPORT_EVERYTHING_HINT}
            onPress={() => void exportAll.run(() => exporter.exportEverything())}
            variant="quiet"
            pending={exportAll.state.status === 'pending'}
            testID="export-everything"
          />
          <ExportNotice state={exportAll.state} testID="export-everything" />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

type CookCardProps = {
  cook: Cook;
  onPress: () => void;
};

/** A cook as a row on Home or in History. */
export function CookCard({ cook, onPress }: CookCardProps) {
  const title = cook.title ?? UNTITLED_COOK;
  const excerpt = verdictExcerpt(cook.verdict);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${title}, ${formatDateTime(cook.startedAt)}`}
      accessibilityHint={cook.status === 'open' ? 'Continue this cook' : 'Open this cook'}
      testID={`cook-card-${cook.id}`}
    >
      <View style={styles.cardRow}>
        <AppText variant="bodyStrong" tone={cook.title ? 'text' : 'muted'} style={styles.cardTitle}>
          {title}
        </AppText>
        {cook.status === 'open' ? <StatusChip status="open" label={STATUS_OPEN} /> : null}
      </View>
      <AppText variant="caption" tone="muted">
        {formatDateTime(cook.startedAt)}
      </AppText>
      {excerpt ? (
        <AppText variant="secondary" numberOfLines={2}>
          {excerpt}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.xs,
    marginTop: space.lg,
  },
  history: {
    marginTop: space.lg,
    alignSelf: 'stretch',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  cardTitle: {
    flexShrink: 1,
  },
});
