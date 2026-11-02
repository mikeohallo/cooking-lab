import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { FilterChip } from '../../components/FilterChip';
import { TagChip } from '../../components/TagChip';
import { TextField } from '../../components/TextField';
import {
  CANCEL,
  CUISINE_ADD_OTHER,
  CUISINE_CHIPS_LABEL,
  CUISINE_CLEAR_HINT,
  CUISINE_OTHER_FIELD_LABEL,
  CUISINE_OTHER_HINT,
  CUISINE_SAVE_OTHER,
} from '../../content/product';
import { CUISINE_LABELS, cuisineLabel } from '../../domain/cookRecord';
import type { CookCuisine } from '../../domain/entities';
import { NAMED_CUISINES, type Cuisine } from '../../domain/enums';
import { makeStyles } from '../../theme/theme';
import { space } from '../../theme/tokens';

/** The most words Other may have, as the data allows. */
const MAX_OTHER_WORDS = 40;

type CuisineChipsProps = {
  /** The cuisine now, or `null` for none. */
  value: CookCuisine | null;
  /** Sets, changes or clears it; resolves with a message when it was not saved. */
  onChange: (cuisine: Cuisine | null, otherWords: string | null) => Promise<string | null>;
  testID?: string;
};

/**
 * Cuisine on the review (0.4.0): the ten as choice chips, then + Other, which
 * opens a short field for the cook's own words. One tap sets it; a tap on the
 * chosen one clears it. Optional, and nothing is chosen for the cook.
 */
export function CuisineChips({ value, onChange, testID = 'cuisine' }: CuisineChipsProps) {
  const styles = useStyles();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const otherWords = value?.cuisine === 'other' ? cuisineLabel(value) : null;

  const save = async (cuisine: Cuisine | null, words: string | null): Promise<boolean> => {
    if (pending) {
      return false;
    }
    setPending(true);
    setProblem(null);
    const failure = await onChange(cuisine, words);
    setPending(false);
    setProblem(failure);
    return failure === null;
  };

  const saveOther = async () => {
    if (await save('other', draft.trim())) {
      setWriting(false);
    }
  };

  const tooLong = draft.trim().length > MAX_OTHER_WORDS;

  return (
    <View style={styles.block} testID={testID}>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={CUISINE_CHIPS_LABEL}>
        {NAMED_CUISINES.map((cuisine) => {
          const selected = value?.cuisine === cuisine;
          return (
            <FilterChip
              key={cuisine}
              kind="choice"
              role="radio"
              label={CUISINE_LABELS[cuisine]}
              selected={selected}
              disabled={pending}
              accessibilityHint={selected ? CUISINE_CLEAR_HINT : undefined}
              onPress={() => void save(selected ? null : cuisine, null)}
              testID={`${testID}-${cuisine}`}
            />
          );
        })}
        {otherWords !== null ? (
          <FilterChip
            kind="choice"
            role="radio"
            label={otherWords}
            selected
            disabled={pending}
            accessibilityHint={CUISINE_CLEAR_HINT}
            onPress={() => void save(null, null)}
            testID={`${testID}-other-chosen`}
          />
        ) : null}
        <TagChip
          name={`+ ${CUISINE_ADD_OTHER}`}
          variant="add"
          disabled={pending}
          onPress={() => {
            setDraft(otherWords ?? '');
            setProblem(null);
            setWriting(true);
          }}
          testID={`${testID}-other`}
        />
      </View>
      {writing ? (
        <View style={styles.form}>
          <TextField
            label={CUISINE_OTHER_FIELD_LABEL}
            value={draft}
            onChangeText={setDraft}
            autoFocus
            maxLength={MAX_OTHER_WORDS + 10}
            onSubmitEditing={() => void saveOther()}
            invalid={tooLong}
            helper={CUISINE_OTHER_HINT}
            testID={`${testID}-other-input`}
          />
          <View style={styles.actions}>
            <Button label={CANCEL} variant="text" onPress={() => setWriting(false)} />
            <Button
              label={CUISINE_SAVE_OTHER}
              variant="secondary"
              disabled={draft.trim() === '' || tooLong}
              pending={pending}
              onPress={() => void saveOther()}
              testID={`${testID}-other-save`}
            />
          </View>
        </View>
      ) : null}
      {problem ? (
        <AppText variant="secondary" tone="danger" testID={`${testID}-failed`}>
          {problem}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    block: {
      gap: space.xs,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: space.xs,
    },
    form: {
      gap: space.xs,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: space.xs,
    },
  }),
);
