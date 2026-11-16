import {
  AVG_LAP_MODE,
  CLOCK_FORMAT,
  LIC_BADGE_STYLE,
  NAME_FORMAT,
  RACE_TIMER,
  QUALIFYING_VISIBILITY,
  ROW_PADDING,
} from '@shared/contracts/widget-choices';
import {
  bool,
  choice,
  color,
  defineSettings,
  num,
  type SettingsOf,
} from '@shared/lib/widget-settings-dsl';
import {
  DEFAULT_PLAYER_ACCENT_COLOR,
  DEFAULT_PLAYER_ROW_COLOR,
} from '@widgets/widget-manifest';
import {
  NAME_COLUMN_DEFAULT_PX,
  NAME_COLUMN_MAX_PX,
  NAME_COLUMN_MIN_PX,
} from './relative-utils';

const TIMING_DECIMALS = { min: 0, max: 3, step: 1 };
const DRIVERS_SHOWN = { min: 0, max: 8, step: 1 };

/**
 * The settings that change the table's width: each one re-measures it, so
 * this list is also what `resolveLayoutChange` watches.
 */
const COLUMNS = {
  /**
   * Width of the driver-name column in design px (before `--wfs`). The column is
   * fixed rather than elastic so the table's total width is the sum of its
   * visible columns: narrowing the name narrows the widget instead of shrinking
   * the text, which dragging the widget's edge would do.
   */
  nameColumnWidth: num(
    NAME_COLUMN_DEFAULT_PX,
    { min: NAME_COLUMN_MIN_PX, max: NAME_COLUMN_MAX_PX, step: 5 },
    { label: 'common.nameColumnWidth' }
  ),
  /** Car number badge, in its own column right after the position. */
  showCarNumber: bool(true),
  showLicBadge: bool(true),
  /** Keep the class letter in the SR badge ("A 4.99") or the rating alone ("4.99"). */
  showLicenseLetter: bool(true),
  licBadgeStyle: choice(LIC_BADGE_STYLE, 'badge', {
    label: 'common.licBadgeStyle',
  }),
  showIRating: bool(true),
  /** Round the iRating to a thousand ("9.9k") or spell it out ("9873"), which widens the column. */
  abbreviateIRating: bool(true),
  /** Driver's profile country flag, in its own column before the name. */
  showCountryFlag: bool(false),
  /** The car maker's plate before the driver's name. */
  showBrand: bool(true),
  /** Places gained (▲) or lost (▼) in the class since the start. */
  showPosChange: bool(true),
  /** Projected iRating change. */
  showIrChange: bool(true),
  /** The lap the car is on, "L29". */
  showLapNumber: bool(true),
  showBestLap: bool(true),
  showLastLap: bool(true),
  /** Average lap, as `avgLapMode` says (LapPaceTracker). */
  showAvgLap: bool(true),
  showTire: bool(false),
  /** Laps since the car last left pit road. */
  showStintLaps: bool(false),
  /** Digits after the point in the relative gap. */
  gapDecimals: num(1, TIMING_DECIMALS),
  /** Digits after the point in lap times. */
  lapTimeDecimals: num(2, TIMING_DECIMALS),
} as const;

export const RELATIVE_COLUMN_KEYS = Object.keys(COLUMNS) as Array<
  keyof typeof COLUMNS
>;

export const RELATIVE_SETTINGS = defineSettings('relative', {
  /**
   * Source of the position number in the leftmost column. Row order is always by
   * gap on track — that is what the widget is for — so this affects the number only.
   */
  useLivePositions: bool(true),
  /** Alone on track the strip holds only stale garage entries. */
  qualifyingVisibility: choice(QUALIFYING_VISIBILITY, 'auto'),
  rowPadding: choice(ROW_PADDING, 'narrow', { label: 'common.rowPadding' }),
  ...COLUMNS,
  showPitIndicator: bool(true, { label: 'common.showPitIndicator' }),
  /** Mic beside the driver on the radio, in the channel's colour. */
  showRadioMark: bool(true, { label: 'common.showRadioMark' }),
  /** "J. Smith", "Smith" or "John Smith". */
  nameFormat: choice(NAME_FORMAT, 'initial'),
  showDriverFlags: bool(true),
  /** Cars shown in front of the player. */
  driversAhead: num(3, DRIVERS_SHOWN),
  /** Cars shown behind the player. */
  driversBehind: num(3, DRIVERS_SHOWN),
  /** Which laps the average-lap column averages. */
  avgLapMode: choice(AVG_LAP_MODE, 'session'),
  showColumnHeaders: bool(true),
  /** The strip above the table: temperatures, SoF, incidents and the clock. */
  showTableHeader: bool(true),
  /** The strip under the table: the player's lap and the session timer. */
  showTableFooter: bool(true),
  /** What the footer's session timer shows. */
  raceTimer: choice(RACE_TIMER, 'timeAndLaps'),
  /** The time of day in the footer. */
  showRealTimeClock: bool(false),
  clockFormat: choice(CLOCK_FORMAT, '24h'),
  /** Highlight color for the player's own row. */
  playerRowColor: color(DEFAULT_PLAYER_ROW_COLOR, {
    label: 'common.playerRowColor',
  }),
  /** Color of the player's position number and car number. */
  playerAccentColor: color(DEFAULT_PLAYER_ACCENT_COLOR, {
    label: 'common.playerAccentColor',
  }),
  /** Keeps showing the safety car row while it is parked in its pit stall. */
  paceCarShowInPits: bool(false, { label: 'common.paceCarShowInPits' }),
});

export type RelativeWidgetSettings = SettingsOf<typeof RELATIVE_SETTINGS.shape>;
