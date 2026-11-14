/**
 * Reference laps from Garage 61 and the lap library, and the brake-point
 * cue (ADR-0013, ADR-0014): the payload shapes of `mt-reflaps` and
 * `src-tauri/src/commands/reflaps.rs`. Plain serde payloads outside the
 * specta contract, so written by hand here.
 */

export type BrakeGrade =
  | 'veryEarly'
  | 'early'
  | 'good'
  | 'perfect'
  | 'late'
  | 'veryLate'
  | 'noBrake';

export type BrakeCueMode =
  | 'noReference'
  | 'noZones'
  | 'noCar'
  | 'idle'
  | 'countdown'
  | 'brake'
  | 'braking';

export interface BrakeCueVerdict {
  zoneNo: number;
  grade: BrakeGrade;
  /** Brake-on minus the reference's, seconds; negative is early. */
  dt: number | null;
  /** The same in metres. */
  dm: number | null;
  pending: boolean;
  current: boolean;
  peak: number | null;
  target: number;
}

export interface BrakeCueFrame {
  mode: BrakeCueMode;
  /** 3, 2 or 1 while counting; 0 otherwise. */
  beat: number;
  fill: number;
  join: number;
  zoneNo: number;
  zoneCount: number;
  untilBrake: number | null;
  /** Metres to the zone's brake point. */
  dist: number;
  target: number | null;
  live: number;
  peak: number | null;
  flash: { grade: BrakeGrade; alpha: number } | null;
  finalPeak: { peak: number; target: number; age: number } | null;
  verdict: BrakeCueVerdict | null;
  pips: { grade: BrakeGrade | null; stale: boolean; current: boolean }[];
}

export interface BrakeCueConfig {
  lead: number;
  early: number;
  minPeak: number;
  tol: number;
  perfect: number;
}

export type ReferencePolicy =
  | { source: 'auto' }
  | { source: 'personalBest' }
  | { source: 'library' }
  | { source: 'pinned'; lapId: string };

export type ResolveNote =
  | 'fetched'
  | 'cached'
  | 'offline'
  | 'noToken'
  | 'tokenRejected'
  | 'trackNotOnGarage61'
  | 'carNotOnGarage61'
  | 'noLapsThisSeason'
  | 'rateLimited'
  | 'networkError'
  | 'personalBestChosen'
  | 'pinnedMissing'
  | 'noMatchInLibrary';

export interface ReflapsStatus {
  note: ResolveNote;
  trackId: number;
  carId: number;
  entryId: string | null;
  source: 'garage61' | 'file' | null;
  lapTime: number | null;
  driver: string | null;
}

export type LapMatchStatus =
  | 'match'
  | 'differentCar'
  | 'differentTrack'
  | 'unknown';

export interface LibraryLap {
  id: string;
  source: 'garage61' | 'file';
  trackName: string | null;
  carName: string | null;
  driver: string | null;
  lapTime: number;
  addedAt: number;
  status: LapMatchStatus;
}

export interface ReflapsOverview {
  hasToken: boolean;
  policy: ReferencePolicy;
  status: ReflapsStatus | null;
  laps: LibraryLap[];
}
