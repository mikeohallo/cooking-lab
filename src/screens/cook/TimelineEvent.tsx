import { useState } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { ReadingIcon } from '../../components/ReadingIcon';
import { PHOTO_ALT, PHOTO_LABEL, PHOTO_MISSING, VIEW_PHOTO } from '../../content/product';
import type { CookEvent } from '../../domain/entities';
import { formatTime } from '../../format/dateTime';
import { photoFrame, PLACEHOLDER_RATIO, type PixelSize } from '../../layout/photoFrame';
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
 * amber and says "Internal", and a reading that does not say — one taken
 * "somewhere else", or any reading from before slice 3 — gets a neutral card:
 * the plain surface with a border, the number in the ordinary text colour.
 * Only Internal is amber and only Oven is grey, so a colour always means the
 * same thing. The word is always there: the colour distinguishes the two at a
 * glance and carries none of the meaning on its own.
 *
 * A photograph is the picture itself, whole and at its own shape, full width
 * and in a thin bordered frame so it can never be taken for part of the app.
 * Everything else that can
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
        // Neutral (fix round 0.2.1): slice 1's amber card made a reading of
        // nothing in particular look like an internal one. The stored reading
        // is untouched; only the paint changed.
        return (
          <View style={styles.temperature} testID={`event-${event.id}`}>
            <View style={styles.temperatureRow}>
              <AppText
                variant="temperature"
                style={styles.temperatureValue}
                testID={`reading-value-${event.id}`}
              >
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

      const picture = <TimelinePicture uri={photo.uri} eventId={event.id} />;

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

/**
 * One photograph, whole. `contain`, never `cover`: nothing the camera saw is
 * cut off. The frame is the full width; its height comes from the picture's own
 * proportions once it has loaded, capped by `photoFrame`, and anything taller
 * than the cap is letterboxed on the frame's muted ground.
 */
function TimelinePicture({ uri, eventId }: { uri: string; eventId: string }) {
  const { height: windowHeight } = useWindowDimensions();
  const [frameWidth, setFrameWidth] = useState(0);
  const [natural, setNatural] = useState<PixelSize | null>(null);
  const frame = photoFrame(frameWidth, natural, windowHeight);

  return (
    <View
      style={[styles.photoFrame, frame ? { height: frame.height } : styles.photoFramePending]}
      onLayout={(layout) => setFrameWidth(layout.nativeEvent.layout.width)}
      testID={`photo-frame-${eventId}`}
    >
      <Image
        source={{ uri }}
        style={styles.photo}
        resizeMode="contain"
        accessibilityLabel={PHOTO_ALT}
        onLoad={(loaded) => {
          const source = loaded.nativeEvent?.source;
          if (source && source.width > 0 && source.height > 0) {
            setNatural({ width: source.width, height: source.height });
          }
        }}
        testID={`photo-${eventId}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  temperature: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
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
    color: colors.text,
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
  photoFrame: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.photo,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  photoFramePending: {
    aspectRatio: 1 / PLACEHOLDER_RATIO,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
});
