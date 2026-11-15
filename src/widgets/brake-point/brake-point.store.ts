import { makeAutoObservable, reaction, type IReactionDisposer } from 'mobx';

import type { WidgetInstanceContext } from '@entities/widget/widget-instances.store';
import { useWidgetInstanceStore } from '@entities/widget/widget-instance-context';
import type { LiveWidgetsView } from '@entities/layout/live-widgets.store';
import { BrakeCueChannel } from '@entities/brake-cue/brake-cue-channel';
import type { BrakeCueConfig, BrakeCueFrame } from '@shared/contracts/reflaps';
import type { BrakePointSettings } from './settings-schema';

interface BrakePointDeps {
  liveWidgets: LiveWidgetsView;
  readonly startsWidgetStores: boolean;
}

const MS_PER_SECOND = 1000;
const PERCENT = 100;

/** The backend's units from the widget's settings. */
export const cueConfigOf = (settings: BrakePointSettings): BrakeCueConfig => ({
  lead: settings.countdownSeconds,
  early: settings.reactionSeconds,
  minPeak: settings.minPeakPercent / PERCENT,
  tol: settings.goodWindowMs / MS_PER_SECOND,
  perfect:
    Math.min(settings.perfectWindowMs, settings.goodWindowMs) / MS_PER_SECOND,
});

const sameConfig = (left: BrakeCueConfig, right: BrakeCueConfig): boolean =>
  left.lead === right.lead &&
  left.early === right.early &&
  left.minPeak === right.minPeak &&
  left.tol === right.tol &&
  left.perfect === right.perfect;

/**
 * Holds the last cue frame from the telemetry thread. A preview (no
 * `startsWidgetStores`) opens no channel; a story seeds `frame` directly.
 */
export class BrakePointWidgetStore {
  frame: BrakeCueFrame | null = null;

  private readonly root: BrakePointDeps;

  private readonly instanceId: string;

  private readonly disposers: IReactionDisposer[] = [];

  private channel: BrakeCueChannel | null = null;

  constructor({ core, instanceId }: WidgetInstanceContext<BrakePointDeps>) {
    this.root = core;
    this.instanceId = instanceId;

    makeAutoObservable<BrakePointWidgetStore, 'root' | 'disposers' | 'channel'>(
      this,
      { root: false, disposers: false, channel: false },
      { autoBind: true }
    );

    if (!core.startsWidgetStores) return;

    const channel = new BrakeCueChannel((frame) => this.setFrame(frame));

    this.channel = channel;
    this.disposers.push(
      reaction(
        () => cueConfigOf(this.settings),
        (config) => channel.configure(config),
        { fireImmediately: true, equals: sameConfig }
      )
    );
  }

  get settings(): BrakePointSettings {
    return this.root.liveWidgets.getSettings<BrakePointSettings>(
      this.instanceId
    );
  }

  setFrame(frame: BrakeCueFrame | null) {
    this.frame = frame;
  }

  dispose() {
    for (const disposer of this.disposers) {
      disposer();
    }

    this.disposers.length = 0;
    this.channel?.close(cueConfigOf(this.settings));
    this.channel = null;
  }
}

export const useBrakePointWidgetStore = () =>
  useWidgetInstanceStore<BrakePointWidgetStore>();
