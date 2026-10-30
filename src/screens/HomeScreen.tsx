import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { usePendingDeletion } from '../state/PendingDeletion';
import { useStorage } from '../state/StorageProvider';
import { useCookList, verdictExcerpt } from '../state/useCookList';
import { useExport } from '../state/useExport';
import { useWrite } from '../state/useWrite';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { CoreLoop } from '../components/CoreLoop';
import { MealTypeLabel } from '../components/MealTypeLabel';
import { ScreenContainer } from '../components/ScreenContainer';
import { ShellHeader } from '../components/ShellHeader';
import { StateNotice } from '../components/StateNotice';
import { StatusChip } from '../components/StatusChip';
import {
  CONTINUE_COOKING,
  DELETE_COOK,
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
  WHOS_EATING,
  WHOS_EATING_HINT,
} from '../content/product';
import type { Cook, CookId } from '../domain/entities';
import type { StoredMealType } from '../domain/enums';
import { formatDateTime } from '../format/dateTime';
import { space } from '../theme/tokens';
import { CookActions } from './CookActions';
import { ExportNotice } from './ExportNotice';

const RECENT_LIMIT = 5;

type HomeScreenProps = {
  onOpenCook: (cookId: CookId) => void;
  onHistory: () => void;
  /** Opens "Who's eating" (0.3.0). */
  onHousehold?: () => void;
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
export function HomeScreen({
  onOpenCook,
  onHistory,
  onHousehold = () => {},
  refreshToken = 0,
}: HomeScreenProps) {
  const { data, exporter, newId, now } = useStorage();
  // A cook deleted, or brought back with Undo, changes the lists too.
  const { version } = usePendingDeletion();
  const reload = refreshToken + version;
  const open = useCookList({ status: 'open', sort: 'newest_first' }, reload);
  const recent = useCookList(
    { status: 'reviewed', sort: 'newest_first', page: { limit: RECENT_LIMIT + 1 } },
    reload,
  );
  const [actionsFor, setActionsFor] = useState<Cook | null>(null);
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
            <CookCard
              key={cook.id}
              cook={cook}
              verdict={open.verdicts[cook.id] ?? cook.verdict}
              mealType={open.mealTypes[cook.id] ?? null}
              onPress={() => onOpenCook(cook.id)}
              onLongPress={() => setActionsFor(cook)}
            />
          ))}
        </View>
      ) : null}

      {recent.status === 'ready' && recent.cooks.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="sectionTitle">{RECENT_COOKS}</AppText>
          {recent.cooks.slice(0, RECENT_LIMIT).map((cook) => (
            <CookCard
              key={cook.id}
              cook={cook}
              verdict={recent.verdicts[cook.id] ?? cook.verdict}
              mealType={recent.mealTypes[cook.id] ?? null}
              onPress={() => onOpenCook(cook.id)}
              onLongPress={() => setActionsFor(cook)}
            />
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

      <ActionButton
        label={WHOS_EATING}
        accessibilityHint={WHOS_EATING_HINT}
        onPress={onHousehold}
        variant="quiet"
        testID="whos-eating"
        style={styles.household}
      />

      {loaded && !isEmpty ? (
        <View style={styles.section} testID="export-section">
          <ActionButton
            label={EXPORT_EVERYTHING}
            onPress={() => void exportAll.run(() => exporter.exportEverything())}
            variant="quiet"
            pending={exportAll.state.status === 'pending'}
            testID="export-everything"
          />
          <AppText variant="caption" tone="muted" style={styles.exportHint}>
            {EXPORT_EVERYTHING_HINT}
          </AppText>
          <ExportNotice state={exportAll.state} testID="export-everything" />
        </View>
      ) : null}

      <CookActions cook={actionsFor} onClose={() => setActionsFor(null)} />
    </ScreenContainer>
  );
}

type CookCardProps = {
  cook: Cook;
  /** The verdict as it now reads — its newest edit, or as first written. */
  verdict?: string | null;
  /** Its meal type, shown as a small label above the title (0.3.0). */
  mealType?: StoredMealType | null;
  onPress: () => void;
  /** Opens the cook's actions (Delete cook). */
  onLongPress?: () => void;
};

/** A cook as a row on Home or in History. Long-press for Delete cook. */
export function CookCard({ cook, verdict, mealType = null, onPress, onLongPress }: CookCardProps) {
  const title = cook.title ?? UNTITLED_COOK;
  const excerpt = verdictExcerpt(verdict === undefined ? cook.verdict : verdict);
  return (
    <Card
      onPress={onPress}
      onLongPress={onLongPress}
      longPressLabel={DELETE_COOK}
      accessibilityLabel={`${title}, ${formatDateTime(cook.startedAt)}`}
      accessibilityHint={cook.status === 'open' ? 'Continue this cook' : 'Open this cook'}
      testID={`cook-card-${cook.id}`}
    >
      <MealTypeLabel mealType={mealType} testID={`cook-meal-${cook.id}`} />
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
  household: {
    marginTop: space.xs,
    alignSelf: 'stretch',
  },
  exportHint: {
    textAlign: 'center',
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
