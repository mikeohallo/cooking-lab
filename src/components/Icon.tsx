import { Circle, Path, Rect, Svg } from 'react-native-svg';

import { useColors } from '../theme/theme';
import { size as sizes, type ColorRole } from '../theme/tokens';

/**
 * The app's own icons, drawn to Material Symbols Rounded's rules: a 24 grid,
 * a 2 px line, round caps and joins (Design Baseline v3). Each is named after
 * what it shows; `MATERIAL_SYMBOL` gives the nearest Material Symbols Rounded
 * icon for each, the design system's source.
 *
 * An icon is always beside a word, except ⋯, the camera and the filter
 * button, whose controls carry an accessibility label. So the drawing itself
 * is hidden from the screen reader.
 */
export type IconName =
  | 'apple'
  | 'arrowUp'
  | 'book'
  | 'bowl'
  | 'cake'
  | 'camera'
  | 'check'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'clock'
  | 'close'
  | 'coffee'
  | 'filter'
  | 'flame'
  | 'forkKnife'
  | 'globe'
  | 'history'
  | 'lightbulb'
  | 'lock'
  | 'more'
  | 'oven'
  | 'page'
  | 'pencil'
  | 'people'
  | 'plus'
  | 'probe'
  | 'refresh'
  | 'search'
  | 'star'
  | 'sun'
  | 'trash';

/** The nearest Material Symbols Rounded icon to each of the app's own. */
export const MATERIAL_SYMBOL: Readonly<Record<IconName, string>> = {
  apple: 'nutrition',
  arrowUp: 'arrow_upward',
  book: 'menu_book',
  // There is no bowl with leaves in Material Symbols; rice_bowl is the
  // nearest, and the app's own drawing adds the leaves.
  bowl: 'rice_bowl',
  cake: 'cake',
  camera: 'photo_camera',
  check: 'check',
  chevronDown: 'expand_more',
  chevronLeft: 'chevron_left',
  chevronRight: 'chevron_right',
  clock: 'schedule',
  close: 'close',
  coffee: 'coffee',
  filter: 'tune',
  flame: 'local_fire_department',
  forkKnife: 'restaurant',
  globe: 'globe',
  history: 'history',
  lightbulb: 'lightbulb',
  lock: 'lock',
  more: 'more_horiz',
  oven: 'oven_gen',
  page: 'description',
  pencil: 'edit',
  people: 'group',
  plus: 'add',
  probe: 'thermometer',
  refresh: 'refresh',
  search: 'search',
  star: 'star',
  sun: 'light_mode',
  trash: 'delete',
};

type Shape =
  | { readonly d: string; readonly fill?: boolean }
  | { readonly circle: readonly [number, number, number]; readonly fill?: boolean }
  | { readonly rect: readonly [number, number, number, number, number] };

const SHAPES: Readonly<Record<IconName, readonly Shape[]>> = {
  apple: [
    {
      d: 'M12 7.5c-1.4-.9-3.3-1.2-4.8-.4-2.4 1.3-2.9 4.4-1.9 7.3 1 3 3.1 6.1 5.2 5.6.6-.1 1-.4 1.5-.4s.9.3 1.5.4c2.1.5 4.2-2.6 5.2-5.6 1-2.9.5-6-1.9-7.3-1.5-.8-3.4-.5-4.8.4z',
    },
    { d: 'M12 7.5c0-2 .9-3.4 2.4-4.2' },
  ],
  arrowUp: [{ d: 'M12 19V5.5M6.5 11 12 5.5l5.5 5.5' }],
  book: [
    { d: 'M6.5 4h11a1.5 1.5 0 0 1 1.5 1.5V20H7.5A2.5 2.5 0 0 1 5 17.5v-12A1.5 1.5 0 0 1 6.5 4z' },
    { d: 'M5 17.5A2.5 2.5 0 0 1 7.5 15H19' },
    { d: 'M9 8h6' },
  ],
  bowl: [
    { d: 'M3.5 12.5h17c0 4.2-3.8 7.5-8.5 7.5s-8.5-3.3-8.5-7.5z' },
    { d: 'M10.5 12.5c-.7-2.9.6-5.4 3.6-6.6.6 2.9-.7 5.4-3.6 6.6z' },
    { d: 'M15 12.5c.7-1.5 2.1-2.4 4-2.5' },
    { d: 'M8.5 12.5c-.2-1.6-1.2-2.8-2.8-3.3' },
  ],
  cake: [
    { d: 'M4 20.5h16' },
    { d: 'M5.5 20.5V13h13v7.5' },
    { d: 'M5.5 16.2c2.2 1.3 4.3 1.3 6.5 0s4.3-1.3 6.5 0' },
    { d: 'M12 13V9.5' },
    { circle: [12, 6, 1.4], fill: true },
  ],
  camera: [
    {
      d: 'M4 8.5A2 2 0 0 1 6 6.5h2l1.6-2.2h4.8L16 6.5h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
    },
    { circle: [12, 13, 3.5] },
  ],
  check: [{ d: 'M5 12.5 9.5 17 19 7.5' }],
  chevronDown: [{ d: 'M6 9.5l6 6 6-6' }],
  chevronLeft: [{ d: 'M14.5 6 8.5 12l6 6' }],
  chevronRight: [{ d: 'M9.5 6l6 6-6 6' }],
  clock: [{ circle: [12, 12, 8.5] }, { d: 'M12 7.5V12l3 2' }],
  close: [{ d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }],
  coffee: [
    { d: 'M5 8.5h11V13a5.5 5.5 0 0 1-11 0z' },
    { d: 'M16 10h1.4a2.4 2.4 0 0 1 0 4.8H16' },
    { d: 'M4 21h13' },
    { d: 'M9 3.5v2M12.5 3.5v2' },
  ],
  filter: [
    { d: 'M4 7.5h9M18 7.5h2M4 16.5h3M11 16.5h9' },
    { circle: [15.5, 7.5, 2.2] },
    { circle: [8.5, 16.5, 2.2] },
  ],
  flame: [
    {
      d: 'M12 2.8c.6 3.4 5.4 5.4 5.4 10.7a5.4 5.4 0 0 1-10.8 0c0-2.3 1-3.9 2.3-5 .3 1.6 1.1 2.7 2.3 3.2-.7-2.9-.3-6.3.8-8.9z',
    },
  ],
  forkKnife: [
    { d: 'M6 3v5.5a2 2 0 0 0 4 0V3M8 10.5V21M8 3v4' },
    { d: 'M17.5 21V3c-2.2 1.4-3.2 4-3.2 7.4v2.1h3.2' },
  ],
  globe: [
    { circle: [12, 12, 8.5] },
    { d: 'M3.5 12h17' },
    { d: 'M12 3.5c2.3 2.5 3.5 5.3 3.5 8.5s-1.2 6-3.5 8.5c-2.3-2.5-3.5-5.3-3.5-8.5s1.2-6 3.5-8.5z' },
  ],
  history: [
    { d: 'M4 12a8 8 0 1 0 2.3-5.7' },
    { d: 'M4 4v4h4' },
    { d: 'M12 8v4l2.5 2' },
  ],
  lightbulb: [
    { d: 'M9.5 17.5h5M10.5 20.5h3' },
    {
      d: 'M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.5.4.9 1 .9 1.7v.3h5v-.3c0-.7.4-1.3.9-1.7A5.8 5.8 0 0 0 12 3.5z',
    },
  ],
  lock: [{ rect: [5, 10.5, 14, 10, 2] }, { d: 'M8 10.5V8a4 4 0 0 1 8 0v2.5' }],
  more: [
    { circle: [5.5, 12, 1.8], fill: true },
    { circle: [12, 12, 1.8], fill: true },
    { circle: [18.5, 12, 1.8], fill: true },
  ],
  oven: [
    { rect: [4, 3.5, 16, 17, 2.5] },
    { d: 'M4 8h16' },
    { d: 'M7.5 5.8h.01M10.5 5.8h.01' },
    { rect: [7.5, 11, 9, 6, 1.2] },
  ],
  page: [
    { d: 'M7 3.5h6.5l4.5 4.5v10.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z' },
    { d: 'M13.5 3.5V8H18' },
    { d: 'M8.5 12.5h6M8.5 16h4' },
  ],
  pencil: [
    { d: 'M4.5 19.5l.9-3.8L15.6 5.5a2 2 0 0 1 2.9 2.9L8.3 18.6z' },
    { d: 'M13.8 7.3l2.9 2.9' },
  ],
  people: [
    { circle: [9, 8, 3.2] },
    { d: 'M3.5 19.5c.4-3.2 2.6-5.2 5.5-5.2s5.1 2 5.5 5.2' },
    { d: 'M15.5 5.2a3.2 3.2 0 0 1 0 5.6M17 14.6c2 .6 3.2 2.4 3.5 4.9' },
  ],
  plus: [{ d: 'M12 5.5v13M5.5 12h13' }],
  probe: [
    { d: 'M10 13.6V5.5a2 2 0 0 1 4 0v8.1a4 4 0 1 1-4 0z' },
    { d: 'M12 9.5v6' },
  ],
  refresh: [{ d: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3' }, { d: 'M19.5 4.5v4h-4' }],
  search: [{ circle: [10.8, 10.8, 6.3] }, { d: 'M15.5 15.5l4.5 4.5' }],
  star: [
    {
      d: 'M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.6l-5.1 2.6 1-5.6-4.1-4 5.7-.8z',
      fill: true,
    },
  ],
  sun: [
    { circle: [12, 12, 3.8] },
    { d: 'M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3' },
  ],
  trash: [
    { d: 'M4.5 7h15M9.5 7V4.5h5V7' },
    { d: 'M6.5 7l.9 12a1.8 1.8 0 0 0 1.8 1.5h5.6a1.8 1.8 0 0 0 1.8-1.5l.9-12' },
    { d: 'M10 11v6M14 11v6' },
  ],
};

type IconProps = {
  name: IconName;
  /** The colour role it is drawn in. */
  color?: ColorRole;
  size?: number;
  testID?: string;
};

export function Icon({ name, color = 'ink', size = sizes.icon, testID }: IconProps) {
  const ink = useColors()[color];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={ink}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID ?? `icon-${name}`}
    >
      {SHAPES[name].map((shape, index) => {
        if ('d' in shape) {
          return <Path key={index} d={shape.d} fill={shape.fill ? ink : 'none'} />;
        }
        if ('circle' in shape) {
          const [cx, cy, r] = shape.circle;
          return <Circle key={index} cx={cx} cy={cy} r={r} fill={shape.fill ? ink : 'none'} />;
        }
        const [x, y, width, height, rx] = shape.rect;
        return <Rect key={index} x={x} y={y} width={width} height={height} rx={rx} />;
      })}
    </Svg>
  );
}

/** Each meal's icon. */
export const MEAL_ICON = {
  breakfast: 'coffee',
  lunch_dinner: 'forkKnife',
  dessert: 'cake',
  snack: 'apple',
  side: 'bowl',
} as const satisfies Record<string, IconName>;
