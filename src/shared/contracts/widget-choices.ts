/**
 * Choices several widgets offer, or code outside a widget reads, declared once.
 * A widget's `settings-schema.ts` wraps one in `choice(...)`; the type beside
 * it is what the rest of the app names the value by.
 *
 * A choice only one widget has stays in that widget's schema.
 */

/**
 * Whether other drivers are drawn in a qualifying session: `auto` blanks them
 * in solo qualifying, where the cars are not on track with you.
 */
export const QUALIFYING_VISIBILITY = ['always', 'auto', 'never'] as const;
export type QualifyingVisibility = (typeof QUALIFYING_VISIBILITY)[number];

export const ROW_PADDING = ['narrow', 'medium', 'wide'] as const;
export type RowPadding = (typeof ROW_PADDING)[number];

/**
 * How the SR value is drawn: `badge` is the two-tone chip (class letter on the
 * class color, rating on a darker half), `plain` is the bare number in the class
 * color, and `dark` keeps the letter's colored plate but puts the number in the
 * class color on a near-black ground.
 */
export const LIC_BADGE_STYLE = ['badge', 'plain', 'dark'] as const;
export type LicBadgeStyle = (typeof LIC_BADGE_STYLE)[number];

/**
 * Whose lap a lap counter shows: `session` is the race's own lap — the
 * leader's — and `player` is the lap the player is on, which a lapped car
 * reads lower.
 */
export const LAP_COUNTER = ['session', 'player'] as const;
export type LapCounter = (typeof LAP_COUNTER)[number];

export const LAP_DELTA_REFERENCE = [
  'personal_best',
  'personal_optimal',
  'session_best',
  'session_optimal',
  'session_last',
] as const;
export type LapDeltaReference = (typeof LAP_DELTA_REFERENCE)[number];

/**
 * How a flag zone is painted: `filled` covers the whole track surface,
 * `outline` keeps the same colour and opacity but only along each edge of it,
 * leaving the surface underneath visible.
 */
export const FLAG_ZONE_STYLE = ['filled', 'outline'] as const;
export type FlagZoneStyle = (typeof FLAG_ZONE_STYLE)[number];

/**
 * What the average-lap column averages. `recent`: each car's last five clean
 * laps (no pit, no unusually slow lap). `session`: every lap it has completed.
 */
export const AVG_LAP_MODE = ['recent', 'session'] as const;
export type AvgLapMode = (typeof AVG_LAP_MODE)[number];

/** How a driver's name is written: "J. Smith", "Smith" or "John Smith". */
export const NAME_FORMAT = ['initial', 'last', 'full'] as const;
export type NameFormat = (typeof NAME_FORMAT)[number];

/** What a session timer shows: the clock and the laps, or one of them. */
export const RACE_TIMER = ['timeAndLaps', 'time', 'laps'] as const;
export type RaceTimer = (typeof RACE_TIMER)[number];

/** A wall clock in 24-hour or 12-hour form. */
export const CLOCK_FORMAT = ['24h', '12h'] as const;
export type ClockFormat = (typeof CLOCK_FORMAT)[number];

/** The standings table's view — cycled by a hotkey, in this order. */
export const STANDINGS_VIEW_MODE = ['all', 'grouped', 'cycling'] as const;
export type StandingsViewMode = (typeof STANDINGS_VIEW_MODE)[number];

/*
 * Every widget that prints a position number carries its own `useLivePositions`
 * flag with these semantics. On: rank by order on track, recomputed from covered
 * distance every tick. Off: the sim's official number, which only refreshes when
 * a car crosses start/finish — outside a race that order is by best lap. The flag
 * is not conditioned on session type; practice, qualifying and race behave alike.
 */
