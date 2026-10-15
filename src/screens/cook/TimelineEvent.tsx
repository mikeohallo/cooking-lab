import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import type { CookEvent } from '../../domain/entities';
import { formatTime } from '../../format/dateTime';
import { colors, radius, space } from '../../theme/tokens';
import { formatCelsius, whereFromEvent } from './temperature';

type TimelineEventProps = {
  event: CookEvent;
};

/**
 * One entry in a cook's timeline: raw evidence, shown as what it is.
 *
 * A note is a warm surface card with its time; a temperature is a compact
 * amber card with the reading large; anything else that can legitimately be in
 * a timeline is labelled with its kind so it can never pass for the cook's own
 * words.
 */
export function TimelineEvent({ event }: TimelineEventProps) {
  const time = formatTime(event.ts);

  switch (event.kind) {
    case 'user_note':
      return (
        <Card testID={`event-${event.id}`}>
          <AppText variant="body">{event.body ?? ''}</AppText>
          <AppText variant="caption" tone="muted">
            {time}
          </AppText>
        </Card>
      );

    case 'temp': {
      const where = whereFromEvent(event);
      return (
        <View style={styles.temperature} testID={`event-${event.id}`}>
          <View style={styles.temperatureRow}>
            <AppText variant="temperature" style={styles.temperatureValue}>
              {formatCelsius(event)}
            </AppText>
            <View style={styles.temperatureDetail}>
              {where ? <AppText variant="bodyStrong">{where}</AppText> : null}
              <AppText variant="caption" tone="muted">
                {time}
              </AppText>
            </View>
          </View>
        </View>
      );
    }

    case 'photo':
      return (
        <Card variant="muted" testID={`event-${event.id}`}>
          <AppText variant="label" tone="muted">
            Photo
          </AppText>
          <AppText variant="caption" tone="muted">
            {time}
          </AppText>
        </Card>
      );

    case 'assistant_msg':
      return (
        <Card variant="muted" testID={`event-${event.id}`}>
          <AppText variant="label" tone="muted">
            Assistant
          </AppText>
          <AppText variant="body">{event.body ?? ''}</AppText>
          <AppText variant="caption" tone="muted">
            {time}
          </AppText>
        </Card>
      );

    case 'plan':
      return (
        <Card variant="muted" testID={`event-${event.id}`}>
          <AppText variant="label" tone="muted">
            Plan
          </AppText>
          <AppText variant="body">{event.body ?? ''}</AppText>
          <AppText variant="caption" tone="muted">
            {time}
          </AppText>
        </Card>
      );
  }
}

const styles = StyleSheet.create({
  temperature: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  temperatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flexWrap: 'wrap',
  },
  temperatureValue: {
    color: colors.accentPressed,
  },
  temperatureDetail: {
    flexShrink: 1,
    gap: 2,
  },
});
