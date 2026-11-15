import { invoke } from '@tauri-apps/api/core';
import type { UnlistenFn } from '@tauri-apps/api/event';

import {
  REFLAPS_BRAKE_CUE,
  REFLAPS_STATUS,
} from '@shared/contracts/generated/backend-events';
import { listenTo } from './events.service';
import type {
  BrakeGrade,
  BrakeCueMode,
  BrakeCueVerdict,
  BrakeCueFrame,
  BrakeCueConfig,
  ReferencePolicy,
  ResolveNote,
  ReflapsStatus,
  LapMatchStatus,
  LibraryLap,
  ReflapsOverview,
} from '@shared/contracts/reflaps';

export type {
  BrakeGrade,
  BrakeCueMode,
  BrakeCueVerdict,
  BrakeCueFrame,
  BrakeCueConfig,
  ReferencePolicy,
  ResolveNote,
  ReflapsStatus,
  LapMatchStatus,
  LibraryLap,
  ReflapsOverview,
};

/**
 * Reference laps from Garage 61 and the lap library, and the brake-point
 * cue (ADR-0013, ADR-0014). The shapes mirror `mt-reflaps` and
 * `src-tauri/src/commands/reflaps.rs`; they are plain serde payloads outside
 * the specta contract.
 *
 * The Garage 61 token goes one way only: `setGarage61Token` hands it to Rust,
 * which stores it in the Windows Credential Manager. No command returns it.
 */

export const getReflapsOverview = () =>
  invoke<ReflapsOverview>('reflaps_overview');

export const setGarage61Token = (token: string) =>
  invoke<void>('reflaps_set_token', { token });

export const clearGarage61Token = () => invoke<void>('reflaps_clear_token');

export const setReferencePolicy = (policy: ReferencePolicy) =>
  invoke<void>('reflaps_set_policy', { policy });

export const refreshReference = () => invoke<void>('reflaps_refresh');

export const deleteLibraryLap = (id: string) =>
  invoke<void>('reflaps_delete', { id });

/** Opens the laps folder in Explorer; the path is Rust's, not the webview's. */
export const openLapsFolder = () => invoke<void>('reflaps_open_inbox');

/** Opens a file dialog in Rust; resolves the new lap's id, or null if cancelled. */
export const importLapCsv = () => invoke<string | null>('reflaps_import_csv');

export const configureBrakeCue = (enabled: boolean, config: BrakeCueConfig) =>
  invoke<void>('brake_cue_configure', { enabled, config });

export const listenBrakeCue = (
  handler: (frame: BrakeCueFrame) => void
): Promise<UnlistenFn> =>
  listenTo<BrakeCueFrame>(REFLAPS_BRAKE_CUE, (event) => handler(event.payload));

export const listenReflapsStatus = (
  handler: (status: ReflapsStatus) => void
): Promise<UnlistenFn> =>
  listenTo<ReflapsStatus>(REFLAPS_STATUS, (event) => handler(event.payload));
