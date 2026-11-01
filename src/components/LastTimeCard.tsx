import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';

type LastTimeCardProps = {
  /** "Last time · Fri 30 Oct". */
  heading: string;
  /** The average, "4.5", shown beside a star; null with no ratings. */
  average?: string | null;
  /** "· 2 ratings, 1 N/A". */
  ratingSummary?: string | null;
  openLabel: string;
  openHint?: string;
  onOpen: () => void;
  /** More of the earlier cook, under the heading. */
  children?: ReactNode;
  testID?: string;
};

/**
 * A short look back at the last time this dish was cooked: a clock, "Last
 * time" and its date, the average with its star, and Open in peach. Only
 * shown when the dish has been cooked before.
 */
export function LastTimeCard({
  heading,
  average = null,
  ratingSummary = null,
  openLabel,
  openHint,
  onOpen,
  children,
  testID = 'last-time',
}: LastTimeCardProps) {
  const styles = useStyles();
  return (
    <Card testID={testID}>
      <View style={styles.row}>
        <View style={styles.text}>
          <View style={styles.heading}>
            <Icon name="clock" color="ink" size={size.icon - 4} />
            <AppText variant="bodyStrong" accessibilityRole="header" style={styles.shrink}>
              {heading}
            </AppText>
          </View>
          {average !== null ? (
            <View style={styles.heading} testID={`${testID}-average`}>
              <Icon name="star" color="star" size={size.iconSmall} />
              <AppText variant="secondary">
                <AppText variant="bodyStrong">{average}</AppText>
                {ratingSummary ? (
                  <AppText variant="secondary" tone="inkMuted">{` ${ratingSummary}`}</AppText>
                ) : null}
              </AppText>
            </View>
          ) : null}
        </View>
        <Button
          label={openLabel}
          variant="peach"
          accessibilityHint={openHint}
          onPress={onOpen}
          testID={`${testID}-open`}
        />
      </View>
      {children}
    </Card>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    text: {
      flex: 1,
      gap: space.xxs,
    },
    heading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    shrink: {
      flexShrink: 1,
    },
  }),
);
