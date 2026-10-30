import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { TextField } from '../../components/TextField';
import {
  HOUSEHOLD_ADD,
  HOUSEHOLD_NAME_PLACEHOLDER,
  MOVE_DOWN,
  MOVE_UP,
  NO_HOUSEHOLD_YET,
  RESTORE,
  RETIRE,
  RETIRED_BODY,
  RETIRED_HEADING,
} from '../../content/product';
import type { HouseholdMember } from '../../domain/entities';
import { activeMembers, retiredMembers } from '../../domain/household';
import { MAX_PERSON_NAME_LENGTH } from '../../domain/invariants';
import { useStorage } from '../../state/StorageProvider';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../../theme/tokens';

type HouseholdEditorProps = {
  members: readonly HouseholdMember[];
  /** The list as the store now has it, after any change. */
  onChanged: (members: readonly HouseholdMember[]) => void;
  testID?: string;
};

/**
 * Who usually eats (0.3.0): add a name, put the names in order, and say when
 * someone no longer eats here. Nobody is deleted — a retired person keeps
 * every rating they gave and can be brought back.
 *
 * Reordering is by Move up / Move down, one 48 dp button each, so it never
 * depends on a drag a screen reader cannot do.
 */
export function HouseholdEditor({ members, onChanged, testID = 'household' }: HouseholdEditorProps) {
  const { data, newId, now } = useStorage();
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = activeMembers(members);
  const retired = retiredMembers(members);

  const run = async (work: () => Promise<string | null>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const failure = await work();
      setProblem(failure);
      onChanged(await data.household.list());
    } catch (cause: unknown) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    void run(async () => {
      const decision = await data.householdWorkflow.add(draft, { id: newId() }, now());
      if (!decision.allowed) {
        return decision.message;
      }
      setDraft('');
      return null;
    });

  return (
    <View style={styles.block} testID={testID}>
      {active.length === 0 ? (
        <AppText variant="secondary" tone="muted">
          {NO_HOUSEHOLD_YET}
        </AppText>
      ) : null}
      {active.map((member, index) => (
        <Card key={member.id} testID={`${testID}-member-${member.id}`}>
          <View style={styles.memberRow}>
            <AppText variant="bodyStrong" style={styles.name}>
              {member.name}
            </AppText>
            <View style={styles.memberActions}>
              <Arrow
                glyph="↑"
                label={`${MOVE_UP}: ${member.name}`}
                disabled={index === 0 || busy}
                onPress={() => void run(async () => (await data.householdWorkflow.move(member.id, 'up'), null))}
                testID={`${testID}-up-${member.id}`}
              />
              <Arrow
                glyph="↓"
                label={`${MOVE_DOWN}: ${member.name}`}
                disabled={index === active.length - 1 || busy}
                onPress={() => void run(async () => (await data.householdWorkflow.move(member.id, 'down'), null))}
                testID={`${testID}-down-${member.id}`}
              />
            </View>
          </View>
          <ActionButton
            label={RETIRE}
            variant="quiet"
            accessibilityHint={`${member.name}. Their ratings are kept.`}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                const decision = await data.householdWorkflow.retire(member.id, now());
                return decision.allowed ? null : decision.message;
              })
            }
            testID={`${testID}-retire-${member.id}`}
            style={styles.retire}
          />
        </Card>
      ))}

      <View style={styles.addRow}>
        <View style={styles.addField}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder={HOUSEHOLD_NAME_PLACEHOLDER}
            accessibilityLabel={HOUSEHOLD_NAME_PLACEHOLDER}
            onSubmitEditing={add}
            invalid={draft.trim().length > MAX_PERSON_NAME_LENGTH}
            helper={problem ?? undefined}
            testID={`${testID}-name`}
          />
        </View>
        <ActionButton
          label={HOUSEHOLD_ADD}
          variant="secondary"
          disabled={draft.trim() === '' || busy}
          onPress={add}
          testID={`${testID}-add`}
        />
      </View>

      {retired.length > 0 ? (
        <View style={styles.block} testID={`${testID}-retired`}>
          <AppText variant="label" tone="muted">
            {RETIRED_HEADING}
          </AppText>
          <AppText variant="caption" tone="muted">
            {RETIRED_BODY}
          </AppText>
          {retired.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <AppText variant="body" tone="muted" style={styles.name}>
                {member.name}
              </AppText>
              <ActionButton
                label={RESTORE}
                variant="quiet"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const decision = await data.householdWorkflow.restore(member.id);
                    return decision.allowed ? null : decision.message;
                  })
                }
                testID={`${testID}-restore-${member.id}`}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A 48 dp arrow with a spoken name, so reordering never depends on a drag. */
function Arrow({
  glyph,
  label,
  disabled,
  onPress,
  testID,
}: {
  glyph: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed, disabled && styles.arrowDisabled]}
      testID={testID}
    >
      <AppText variant="bodyStrong" tone="primary" importantForAccessibility="no">
        {glyph}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  name: {
    flexShrink: 1,
  },
  memberActions: {
    flexDirection: 'row',
    gap: space.xxs,
  },
  arrow: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  arrowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  arrowDisabled: {
    opacity: 0.35,
  },
  retire: {
    alignSelf: 'flex-start',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  addField: {
    flex: 1,
  },
});
