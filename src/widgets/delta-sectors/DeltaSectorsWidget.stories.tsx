import type { Meta, StoryObj } from '@storybook/react-vite';

import { mockReferenceLap } from '@features/preview/mocks/coach';
import { mockLapDelta, mockLapTiming } from '@features/preview/mocks/delta';
import { mockSectors } from '@features/preview/mocks/timing';
import { defineWidgetStories } from '@/storybook/define-widget-stories';
import { DeltaSectorsWidget } from './DeltaSectorsWidget';

interface StoryArgs {
  /** Whether a reference lap is loaded. */
  hasReference: boolean;
  sectorCount: number;
  /** The sector the car is in. */
  currentSectorIdx: number;
  /** How far through that sector it is, 0-1. */
  sectorProgress: number;
  /** What the running sector has lost (+) or gained (-) so far, seconds. */
  liveDelta: number;
  bestLapTime: number;
  lastLapTime: number;
}

/**
 * A synthetic reference: the builder's lap, its clock left out, so the widget
 * rebuilds it from the speeds the way it does for an older stored lap.
 */
const REFERENCE = mockReferenceLap();
const REFERENCE_SECTOR_S = (sectorCount: number) =>
  REFERENCE.lapTime / sectorCount;

/** What each banked sector gained or lost on the reference, in order. */
const BANKED_DELTAS_S = [-0.112, 0.306, -0.048, 0.191, -0.27, 0.085, 0.12];

const meta: Meta<StoryArgs> = {
  title: 'Widgets/DeltaSectorsWidget',
  ...defineWidgetStories<StoryArgs>({
    widget: DeltaSectorsWidget,
    size: {
      width: 270,
      background: 'transparent',
      border: 'none',
      widgetBg: 'rgba(10, 12, 15, 0.82)',
      overflow: 'visible',
    },
    seedSnapshot: true,
    seed: (store, args) => {
      const sessionInfo = store.session.sessionInfo;

      if (sessionInfo) {
        store.session.updateSessionInfo({
          ...sessionInfo,
          sectors: mockSectors(args.sectorCount),
        });
      }

      if (args.hasReference) {
        store.referenceLap.updateReferenceLap(REFERENCE);
      } else {
        store.referenceLap.reset();
      }

      // The builder's lap is not driven at one speed, so its sectors are not
      // equal in time; the story only needs times of the right size, and the
      // deltas the widget prints are its own arithmetic on them.
      const sectorTime = REFERENCE_SECTOR_S(args.sectorCount);
      const banked = Array.from(
        { length: args.currentSectorIdx },
        (_unused, index) => sectorTime + (BANKED_DELTAS_S[index] ?? 0)
      );
      const bankedTotal = banked.reduce((sum, time) => sum + time, 0);
      const lapPct =
        (args.currentSectorIdx + args.sectorProgress) / args.sectorCount;

      store.backendComputed.updateLapDelta(
        mockLapDelta({
          sectorTimes: Array.from(
            { length: args.sectorCount },
            (_unused, index) => banked[index] ?? null
          ),
          currentSectorIdx: args.currentSectorIdx,
          sectorDeltas: Array.from({ length: args.sectorCount }, () => null),
        })
      );

      store.player.updateLapTiming(
        mockLapTiming({
          lap_dist_pct: lapPct,
          lap_current_lap_time:
            bankedTotal + sectorTime * args.sectorProgress + args.liveDelta,
          lap_best_lap_time: args.bestLapTime,
          lap_last_lap_time: args.lastLapTime,
        })
      );
    },
    args: {
      hasReference: true,
      sectorCount: 5,
      currentSectorIdx: 2,
      sectorProgress: 0.55,
      liveDelta: 0.18,
      bestLapTime: REFERENCE.lapTime + 1.276,
      lastLapTime: REFERENCE.lapTime + 1.619,
    },
    argTypes: {
      sectorCount: { control: { type: 'range', min: 2, max: 8, step: 1 } },
      currentSectorIdx: { control: { type: 'range', min: 0, max: 7, step: 1 } },
      sectorProgress: {
        control: { type: 'range', min: 0, max: 1, step: 0.05 },
      },
      liveDelta: { control: { type: 'range', min: -1, max: 1, step: 0.01 } },
    },
  }),
};

export default meta;

type Story = StoryObj<StoryArgs>;

/** Two sectors banked, the third running a little down on the reference. */
export const Default: Story = {};

/** The running sector up on the reference: its bar and delta turn green. */
export const GainingInSector: Story = { args: { liveDelta: -0.24 } };

/** Just across the line: nothing banked yet, the first sector starting. */
export const LapStart: Story = {
  args: { currentSectorIdx: 0, sectorProgress: 0.08, liveDelta: 0.01 },
};

/** A lap of three sectors fits the rows as it is. */
export const ThreeSectors: Story = {
  args: { sectorCount: 3, currentSectorIdx: 1 },
};

/** No reference lap: the times stay, the deltas are left out. */
export const NoReference: Story = { args: { hasReference: false } };

/** Without the card of laps under the sectors. */
export const SectorsOnly: Story = { args: { showLapCard: false } };
