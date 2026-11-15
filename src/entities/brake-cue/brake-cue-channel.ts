import { configureBrakeCue, listenBrakeCue } from '@shared/api/reflaps.service';
import type { BrakeCueConfig, BrakeCueFrame } from '@shared/contracts/reflaps';

/**
 * Brake-point instances listening in this window. The telemetry thread runs
 * the cue only while one is, so the last to close switches it off.
 */
let openChannels = 0;

/**
 * One widget instance's line to the brake cue on the telemetry thread
 * (ADR-0014): receives its frames and tells it which settings to count with.
 */
export class BrakeCueChannel {
  private unlisten: (() => void) | null = null;

  private open = true;

  constructor(onFrame: (frame: BrakeCueFrame) => void) {
    openChannels++;

    void listenBrakeCue(onFrame).then((unlisten) => {
      if (this.open) {
        this.unlisten = unlisten;
      } else {
        unlisten();
      }
    });
  }

  configure(config: BrakeCueConfig) {
    if (!this.open) return;

    void configureBrakeCue(true, config).catch(console.error);
  }

  close(config: BrakeCueConfig) {
    if (!this.open) return;

    this.open = false;
    this.unlisten?.();
    this.unlisten = null;
    openChannels = Math.max(0, openChannels - 1);

    if (openChannels === 0) {
      void configureBrakeCue(false, config).catch(console.error);
    }
  }
}
