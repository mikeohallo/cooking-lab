import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ZoneBar } from '../../components/Zone';
import { INGREDIENTS_TITLE, ingredientsDetail } from '../../content/product';
import { currentIngredients, ingredientLines } from '../../domain/cookRecord';
import type { IngredientVersion } from '../../domain/entities';
import { makeStyles } from '../../theme/theme';
import { space } from '../../theme/tokens';
import type { Version } from '../cook/VersionsSheet';
import { IngredientsBox } from './IngredientsBox';

type IngredientsSectionProps = {
  versions: readonly IngredientVersion[];
  /** An open cook: an empty list is a field to type or paste into. */
  open: boolean;
  /** Start opened: an open cook with nothing written yet, before the first note. */
  startOpen: boolean;
  onSave: (text: string) => Promise<string | null>;
  onShowVersions: (versions: readonly Version[]) => void;
};

/**
 * The Ingredients bar (0.4.0): quiet sage, "12 · Show", opening the whole list
 * in place, where it can be edited as before (every version kept).
 */
export function IngredientsSection({ versions, open, startOpen, onSave, onShowVersions }: IngredientsSectionProps) {
  const styles = useStyles();
  const [shown, setShown] = useState(startOpen);
  const current = currentIngredients(versions);
  const count = current === null ? 0 : ingredientLines(current.text).length;
  return (
    <View style={styles.section}>
      <ZoneBar
        icon="forkKnife"
        label={INGREDIENTS_TITLE}
        detail={ingredientsDetail(count, shown)}
        trailingIcon={shown ? undefined : 'chevronDown'}
        expanded={shown}
        onPress={() => setShown((now) => !now)}
        testID="ingredients-bar"
      />
      {shown ? (
        <IngredientsBox
          versions={versions}
          hasTimeline={false}
          foldable={false}
          open={open}
          onSave={onSave}
          onShowVersions={onShowVersions}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    section: {
      gap: space.xs,
    },
  }),
);
