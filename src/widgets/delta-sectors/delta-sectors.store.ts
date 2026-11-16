import { makeAutoObservable } from 'mobx';

import type { WidgetInstanceContext } from '@entities/widget/widget-instances.store';
import { useWidgetInstanceStore } from '@entities/widget/widget-instance-context';
import type { BackendComputedStore } from '@entities/cars/computed.store';
import type { PlayerStore } from '@entities/player/player.store';
import type { ReferenceLapStore } from '@entities/player/reference-lap.store';
import type { SessionStore } from '@entities/session/session.store';
import {
  referenceClockOf,
  sectorRowsOf,
  sectorSpansOf,
  type SectorRow,
  type SectorSpan,
} from './delta-sectors-model';

interface DeltaSectorsDeps {
  backendComputed: BackendComputedStore;
  player: PlayerStore;
  referenceLap: ReferenceLapStore;
  session: SessionStore;
}

/** A lap time and what it lost or gained on the reference lap. */
export interface LapFigure {
  time: number | null;
  delta: number | null;
}

/** The three laps the card under the sectors sets side by side. */
export interface LapCard {
  best: LapFigure;
  last: LapFigure;
  /** The reference lap itself; null when none is loaded. */
  reference: number | null;
}

/**
 * The lap split at the session's sector lines and measured against the active
 * reference lap — the same one the brake points count into (ADR-0013/0014).
 * The reference's sector times are read off its own clock once per reference;
 * the rows follow the lap.
 */
export class DeltaSectorsWidgetStore {
  private readonly root: DeltaSectorsDeps;

  constructor({ core }: WidgetInstanceContext<DeltaSectorsDeps>) {
    this.root = core;

    makeAutoObservable<DeltaSectorsWidgetStore, 'root'>(
      this,
      { root: false },
      { autoBind: true }
    );
  }

  get spans(): SectorSpan[] {
    return sectorSpansOf(this.root.session.sessionInfo?.sectors ?? []);
  }

  get reference(): { clock: readonly number[]; lapTime: number } | null {
    const lap = this.root.referenceLap.data;
    const clock = lap ? referenceClockOf(lap.samples, lap.lapTime) : null;

    return lap && clock ? { clock, lapTime: lap.lapTime } : null;
  }

  get hasReference(): boolean {
    return this.reference !== null;
  }

  get currentSectorIdx(): number | null {
    return this.root.backendComputed.currentSectorIdx;
  }

  get rows(): SectorRow[] {
    const timing = this.root.player.lapTiming;

    return sectorRowsOf({
      spans: this.spans,
      reference: this.reference,
      sectorTimes: this.root.backendComputed.sectorTimes,
      currentSectorIdx: this.currentSectorIdx,
      currentLapTime: timing?.lap_current_lap_time ?? 0,
      lapPct: timing?.lap_dist_pct ?? null,
    });
  }

  get lapCard(): LapCard {
    const timing = this.root.player.lapTiming;
    const reference = this.reference?.lapTime ?? null;

    const figureOf = (time: number | null | undefined): LapFigure => {
      const valid = time !== null && time !== undefined && time > 0;

      return {
        time: valid ? time : null,
        delta: valid && reference !== null ? time - reference : null,
      };
    };

    return {
      best: figureOf(timing?.lap_best_lap_time),
      last: figureOf(timing?.lap_last_lap_time),
      reference,
    };
  }

  /** Nothing to release: the store holds no reaction and no channel. */
  dispose() {}
}

export const useDeltaSectorsWidgetStore = () =>
  useWidgetInstanceStore<DeltaSectorsWidgetStore>();
