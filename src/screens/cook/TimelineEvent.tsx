import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { ReadingIcon } from '../../components/ReadingIcon';
import { PHOTO_ALT, PHOTO_LABEL, PHOTO_MISSING, VIEW_PHOTO } from '../../content/product';
import type { CookEvent } from '../../domain/entities';
import { formatTime } from '../../format/dateTime';
import { colors, radius, readingTreatments, space } from '../../theme/tokens';
import { formatCelsius, readingKindFromEvent, readingKindLabel, whereFromEvent } from './temperature';

export type TimelinePhoto = {
  /** Where to draw it from, or `null` while it is being resolved or if it is gone. */
  readonly uri: string | null;
  /** Opens it full screen. Omitted where there is nowhere to open it, as in Review. */
  readonly onOpen?: () => void;
};

type TimelineEventProps = {
  event: CookEvent;
  /** Supplied for a `photo` event by whichever screen resolved the file. */
  photo?: TimelinePhoto;
};

/**
 * One entry in a cook's timeline: raw evidence, shown as what it is.
 *
 * A note is a warm surface card with its time. A temperature reading is a
 * compact card with the number large, and the card says what the reading was
 * taken of — an oven reading is grey and says "Oven", an internal reading is
 * amber and says "Internal", and a reading that does not say keeps the card
 * this app has always drawn. The word is always there: the colour distinguishes
 * the two at a glance and carries none of the meaning on its own.
 *
 * A photograph is the picture itself, full width. Everything else that can
 * legitimately be in a timeline is labelled with its kind so it can never pass
 * for the cook's own words.
 */
export function TimelineEvent({ event, photo }: TimelineEventProps) {
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
      const kind = readingKindFromEvent(event);
      const where = whereFromEvent(event);

      if (kind === 'none') {
        // Unchanged from slice 1, deliberately: a reading already in the
        // notebook must look today exactly as it looked yesterday.
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

      const treatment = readingTreatments[kind];
      const label = readingKindLabel(kind);
      return (
        <View
          style={[
            styles.reading,
            { backgroundColor: treatment.surface, borderColor: treatment.border },
          ]}
          testID={`event-${event.id}`}
        >
          <ReadingIcon kind={kind} testID={`reading-icon-${kind}`} />
          <View style={styles.readingWords}>
            <AppText variant="bodyStrong" style={{ color: treatment.ink }}>
              {label}
            </AppText>
            <AppText variant="caption" tone="muted">
              {where ? `${time} · ${where}` : time}
            </AppText>
          </View>
          <AppText
            variant="temperature"
            style={[styles.readingValue, { color: treatment.ink }]}
            testID={`reading-value-${event.id}`}
          >
            {formatCelsius(event)}
          </AppText>
        </View>
      );
    }

    case 'photo': {
      const caption = (
        <AppText variant="caption" tone="muted">
          {`${PHOTO_LABEL} · ${time}`}
        </AppText>
      );

      if (photo?.uri == null) {
        return (
          <Card variant="muted" testID={`event-${event.id}`}>
            <AppText variant="label" tone="muted">
              {PHOTO_LABEL}
            </AppText>
            <AppText variant="secondary" tone="muted">
              {PHOTO_MISSING}
            </AppText>
            <AppText variant="caption" tone="muted">
              {time}
            </AppText>
          </Card>
        );
      }

      const picture = (
        <Image
          source={{ uri: photo.uri }}
          style={styles.photo}
          resizeMode="cover"
          accessibilityLabel={PHOTO_ALT}
          testID={`photo-${event.id}`}
        />
      );

      if (photo.onOpen === undefined) {
        return (
          <View style={styles.photoBlock} testID={`event-${event.id}`}>
            {picture}
            {caption}
          </View>
        );
      }

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={VIEW_PHOTO}
          accessibilityHint="Opens the photo full screen"
          onPress={photo.onOpen}
          style={styles.photoBlock}
          testID={`event-${event.id}`}
        >
          {picture}
          {caption}
        </Pressable>
      );
    }

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
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  readingWords: {
    flexGrow: 1,
    flexShrink: 1,
    gap: 2,
  },
  readingValue: {
    textAlign: 'right',
  },
  photoBlock: {
    gap: space.xxs,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.photo,
    backgroundColor: colors.surfaceMuted,
  },
});
