import { makeAutoObservable, runInAction } from 'mobx';

import {
  clearGarage61Token,
  deleteLibraryLap,
  getReflapsOverview,
  importLapCsv,
  openLapsFolder,
  listenReflapsStatus,
  refreshReference,
  setGarage61Token,
  setReferencePolicy,
} from '@shared/api/reflaps.service';
import type {
  LibraryLap,
  ReferencePolicy,
  ReflapsOverview,
  ReflapsStatus,
} from '@shared/contracts/reflaps';

/**
 * The Reference laps section of the main window (ADR-0013): the Garage 61
 * token, which reference the session uses, and the lap library. The token is
 * typed here and handed to Rust once; this store never holds it after that.
 */
export class ReferenceLapsStore {
  hasToken = false;
  policy: ReferencePolicy = { source: 'auto' };
  status: ReflapsStatus | null = null;
  laps: LibraryLap[] = [];
  inboxFolder = '';
  busy = false;
  error: string | null = null;

  private unlisten: (() => void) | null = null;

  constructor() {
    makeAutoObservable<ReferenceLapsStore, 'unlisten'>(
      this,
      { unlisten: false },
      { autoBind: true }
    );
  }

  /** Called while the section is on screen. */
  start() {
    void this.load();
    void listenReflapsStatus((status) => {
      runInAction(() => {
        this.status = status;
      });
      void this.load();
    }).then((unlisten) => {
      this.unlisten = unlisten;
    });
  }

  stop() {
    this.unlisten?.();
    this.unlisten = null;
  }

  private apply(overview: ReflapsOverview) {
    this.hasToken = overview.hasToken;
    this.policy = overview.policy;
    this.status = overview.status ?? this.status;
    this.laps = overview.laps;
    this.inboxFolder = overview.inboxFolder;
  }

  async load() {
    try {
      const overview = await getReflapsOverview();

      runInAction(() => this.apply(overview));
    } catch (error) {
      runInAction(() => {
        this.error = String(error);
      });
    }
  }

  private async run(action: () => Promise<unknown>) {
    this.busy = true;
    this.error = null;

    try {
      await action();
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = String(error);
      });
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  }

  saveToken(token: string) {
    return this.run(() => setGarage61Token(token));
  }

  clearToken() {
    return this.run(clearGarage61Token);
  }

  setPolicy(policy: ReferencePolicy) {
    return this.run(() => setReferencePolicy(policy));
  }

  pin(lapId: string) {
    return this.setPolicy({ source: 'pinned', lapId });
  }

  refresh() {
    return this.run(refreshReference);
  }

  openFolder() {
    return this.run(openLapsFolder);
  }

  importCsv() {
    return this.run(importLapCsv);
  }

  deleteLap(id: string) {
    return this.run(() => deleteLibraryLap(id));
  }

  dispose() {
    this.stop();
  }
}

/** `115.992` → `1:55.992`. */
export const formatLapTime = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '–';

  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const rest = totalMs % 60000;

  return `${minutes}:${String(Math.floor(rest / 1000)).padStart(2, '0')}.${String(rest % 1000).padStart(3, '0')}`;
};
