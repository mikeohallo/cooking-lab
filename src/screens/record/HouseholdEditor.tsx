import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { TextField } from '../../components/TextField';
import {
  ADD_SOMEONE,
  CANCEL,
  HOUSEHOLD_ADD,
  HOUSEHOLD_NAME_PLACEHOLDER,
  MOVE_DOWN,
  MOVE_UP,
  NO_HOUSEHOLD_YET,
  RENAME,
  RESTORE,
  RETIRE,
  RETIRED_BODY,
  RETIRED_HEADING,
  SAVE_NAME,
} from '../../content/product';
import type { HouseholdMember, HouseholdMemberId } from '../../domain/entities';
import { activeMembers, retiredMembers } from '../../domain/household';
import { MAX_PERSON_NAME_LENGTH } from '../../domain/invariants';
import { useStorage } from '../../state/StorageProvider';
import { useSaveOnLeave } from '../../state/useSaveOnLeave';
import { makeStyles } from '../../theme/theme';
import { radius, size, space } from '../../theme/tokens';
import { touchSlop } from '../../theme/touch';

type HouseholdEditorProps = {
  members: readonly HouseholdMember[];
  /** The list as the store now has it, after any change. */
  onChanged: (members: readonly HouseholdMember[]) => void;
  testID?: string;
};

/**
 * Who usually eats (0.4.0): a numbered card per person with Rename and the
 * bin, then + Add someone.
 *
 * Nobody is deleted. The bin means "no longer eats here": the person leaves
 * the review's rows and keeps every rating they gave, and can be brought back
 * from the list underneath. The order is the number; it is changed with Move
 * up and Move down, offered to a screen reader on each card.
 *
 * A changed name saves when its field is left — it loses focus, or the
 * keyboard is closed — just as Save does (0.4.0, part 6). An unchanged or
 * empty name saves nothing. A new person's name keeps its words with Add in
 * sight until Add or Cancel.
 */
export function HouseholdEditor({ members, onChanged, testID = 'household' }: HouseholdEditorProps) {
  const styles = useStyles();
  const { data, newId, now } = useStorage();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<HouseholdMemberId | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Busy at once, not after a render: Return saves and then leaves the field,
  // and the leave must see the save already under way.
  const working = useRef(false);
  const active = activeMembers(members);
  const retired = retiredMembers(members);

  const run = async (work: () => Promise<string | null>): Promise<boolean> => {
    if (working.current) {
      return false;
    }
    working.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const failure = await work();
      setProblem(failure);
      onChanged(await data.household.list());
      return failure === null;
    } catch (cause: unknown) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      working.current = false;
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
      setAdding(false);
      return null;
    });

  const rename = (id: HouseholdMemberId): Promise<boolean> =>
    run(async () => {
      const decision = await data.householdWorkflow.rename(id, renameDraft);
      if (!decision.allowed) {
        return decision.message;
      }
      setRenaming(null);
      return null;
    });

  const leavingRename = useSaveOnLeave(() => {
    const member = active.find((candidate) => candidate.id === renaming);
    const name = renameDraft.trim();
    if (
      member === undefined ||
      busy ||
      name === '' ||
      name === member.name ||
      name.length > MAX_PERSON_NAME_LENGTH
    ) {
      return;
    }
    return rename(member.id);
  });

  const move = (id: HouseholdMemberId, direction: 'up' | 'down') =>
    void run(async () => (await data.householdWorkflow.move(id, direction), null));

  return (
    <View style={styles.block} testID={testID}>
      {active.length === 0 ? (
        <AppText variant="secondary" tone="inkMuted">
          {NO_HOUSEHOLD_YET}
        </AppText>
      ) : null}
      {active.map((member, index) =>
        renaming === member.id ? (
          <Card key={member.id} testID={`${testID}-member-${member.id}`}>
            <TextField
              value={renameDraft}
              onChangeText={setRenameDraft}
              accessibilityLabel={`${RENAME}: ${member.name}`}
              autoFocus
              {...leavingRename}
              onSubmitEditing={() => void rename(member.id)}
              invalid={renameDraft.trim().length > MAX_PERSON_NAME_LENGTH}
              helper={problem ?? undefined}
              testID={`${testID}-rename-input-${member.id}`}
            />
            <View style={styles.formActions}>
              <Button
                label={MOVE_UP}
                variant="outlined"
                disabled={index === 0 || busy}
                onPress={() => move(member.id, 'up')}
                testID={`${testID}-up-${member.id}`}
              />
              <Button
                label={MOVE_DOWN}
                variant="outlined"
                disabled={index === active.length - 1 || busy}
                onPress={() => move(member.id, 'down')}
                testID={`${testID}-down-${member.id}`}
              />
            </View>
            <View style={styles.formActions}>
              <Button label={CANCEL} variant="text" onPress={() => setRenaming(null)} />
              <Button
                label={SAVE_NAME}
                variant="secondary"
                disabled={renameDraft.trim() === '' || busy}
                onPress={() => void rename(member.id)}
                testID={`${testID}-rename-save-${member.id}`}
              />
            </View>
          </Card>
        ) : (
          <Card
            key={member.id}
            testID={`${testID}-member-${member.id}`}
            style={styles.card}
          >
            <View
              style={styles.memberRow}
              accessible={false}
              accessibilityActions={[
                ...(index > 0 ? [{ name: 'up', label: `${MOVE_UP}: ${member.name}` }] : []),
                ...(index < active.length - 1 ? [{ name: 'down', label: `${MOVE_DOWN}: ${member.name}` }] : []),
              ]}
              onAccessibilityAction={(event) => {
                const action = event.nativeEvent.actionName;
                if (action === 'up' || action === 'down') {
                  move(member.id, action);
                }
              }}
              testID={`${testID}-row-${member.id}`}
            >
              <View style={styles.number}>
                <AppText variant="bodyStrong">{String(index + 1)}</AppText>
              </View>
              <AppText variant="cardTitle" style={styles.name}>
                {member.name}
              </AppText>
              <Button
                label={RENAME}
                variant="text"
                accessibilityHint={member.name}
                disabled={busy}
                onPress={() => {
                  setProblem(null);
                  setRenameDraft(member.name);
                  setRenaming(member.id);
                }}
                testID={`${testID}-rename-${member.id}`}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${RETIRE}: ${member.name}`}
                accessibilityHint="Their ratings are kept, and they can be brought back"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const decision = await data.householdWorkflow.retire(member.id, now());
                    return decision.allowed ? null : decision.message;
                  })
                }
                hitSlop={BIN_SLOP}
                style={({ pressed }) => [styles.bin, pressed && styles.pressed]}
                testID={`${testID}-retire-${member.id}`}
              >
                <Icon name="trash" color="danger" size={size.icon - 2} />
              </Pressable>
            </View>
          </Card>
        ),
      )}

      {adding ? (
        <View style={styles.addForm} testID={`${testID}-add-form`}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder={HOUSEHOLD_NAME_PLACEHOLDER}
            accessibilityLabel={HOUSEHOLD_NAME_PLACEHOLDER}
            autoFocus
            onSubmitEditing={add}
            invalid={draft.trim().length > MAX_PERSON_NAME_LENGTH}
            helper={renaming === null ? (problem ?? undefined) : undefined}
            testID={`${testID}-name`}
          />
          <View style={styles.formActions}>
            <Button label={CANCEL} variant="text" onPress={() => setAdding(false)} />
            <Button
              label={HOUSEHOLD_ADD}
              variant="secondary"
              disabled={draft.trim() === '' || busy}
              onPress={add}
              testID={`${testID}-add`}
            />
          </View>
        </View>
      ) : (
        <Button
          label={ADD_SOMEONE}
          icon="plus"
          variant="secondary"
          onPress={() => {
            setProblem(null);
            setAdding(true);
          }}
          testID={`${testID}-add-someone`}
        />
      )}

      {retired.length > 0 ? (
        <View style={styles.block} testID={`${testID}-retired`}>
          <AppText variant="label" tone="inkMuted">
            {RETIRED_HEADING}
          </AppText>
          <AppText variant="secondary" tone="inkMuted">
            {RETIRED_BODY}
          </AppText>
          {retired.map((member) => (
            <View key={member.id} style={styles.retiredRow}>
              <AppText variant="body" tone="inkMuted" style={styles.name}>
                {member.name}
              </AppText>
              <Button
                label={RESTORE}
                variant="text"
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

/** The bin is drawn 40 round; its hit area makes 48. */
const BIN_SLOP = touchSlop(size.iconButton, size.iconButton);

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    block: {
      gap: space.sm,
    },
    card: {
      paddingVertical: space.xs,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    number: {
      width: size.iconCircleInner,
      height: size.iconCircleInner,
      borderRadius: radius.pill,
      backgroundColor: colors.zone,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: {
      flex: 1,
    },
    bin: {
      width: size.iconButton,
      height: size.iconButton,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      backgroundColor: colors.dangerSoft,
    },
    retiredRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.xs,
    },
    addForm: {
      gap: space.xs,
    },
    formActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: space.xs,
    },
  }),
);
