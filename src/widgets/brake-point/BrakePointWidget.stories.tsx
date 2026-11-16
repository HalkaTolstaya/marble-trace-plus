import type { Meta, StoryObj } from '@storybook/react-vite';

import { defineWidgetStories } from '@/storybook/define-widget-stories';
import type { BrakeCueFrame, BrakeGrade } from '@shared/contracts/reflaps';
import { BrakePointWidget } from './BrakePointWidget';
import type { BrakePointWidgetStore } from './brake-point.store';

type Scene = 'countdown' | 'brake' | 'graded' | 'noReference';

interface StoryArgs {
  scene: Scene;
  beat: number;
  grade: BrakeGrade;
  showTiming?: boolean;
  showTarget?: boolean;
  showPips?: boolean;
  layout?: 'countdown' | 'meters';
}

const PIPS: BrakeCueFrame['pips'] = [
  { grade: 'perfect', stale: false, current: false },
  { grade: 'good', stale: false, current: false },
  { grade: 'late', stale: false, current: false },
  { grade: null, stale: false, current: true },
  { grade: 'early', stale: true, current: false },
  { grade: 'good', stale: true, current: false },
];

const base: BrakeCueFrame = {
  mode: 'idle',
  beat: 0,
  fill: 0,
  join: 0,
  zoneNo: 4,
  zoneCount: PIPS.length,
  untilBrake: 1.4,
  dist: 92,
  target: 0.82,
  live: 0,
  peak: null,
  flash: null,
  finalPeak: null,
  verdict: {
    zoneNo: 3,
    grade: 'late',
    dt: 0.14,
    dm: 9.6,
    pending: false,
    current: false,
    peak: 0.77,
    target: 0.85,
  },
  pips: PIPS,
};

// Frames as the telemetry thread sends them, one per scene.
const frameOf = (args: StoryArgs): BrakeCueFrame => {
  switch (args.scene) {
    case 'countdown':
      return {
        ...base,
        mode: 'countdown',
        beat: args.beat,
        fill: (3 - args.beat) / 3 + 0.2,
      };
    case 'brake':
      return { ...base, mode: 'brake', fill: 1, untilBrake: -0.05, dist: 3 };
    case 'graded':
      return {
        ...base,
        mode: 'braking',
        fill: 0.98,
        live: 0.74,
        peak: 0.8,
        flash: { grade: args.grade, alpha: 1 },
        verdict: {
          ...base.verdict!,
          zoneNo: 4,
          grade: args.grade,
          dt: args.grade === 'perfect' ? 0.01 : 0.12,
          dm: args.grade === 'perfect' ? 0.7 : 8.2,
          current: true,
          peak: 0.8,
          target: 0.82,
        },
      };
    case 'noReference':
      return { ...base, mode: 'noReference', pips: [], verdict: null };
  }
};

const meta: Meta<StoryArgs> = {
  title: 'Widgets/BrakePointWidget',
  ...defineWidgetStories<StoryArgs>({
    widget: BrakePointWidget,
    size: { width: 340, height: 84 },
    seed: (store, args) => {
      store.widgetInstances.seed<BrakePointWidgetStore>(
        'brake-point',
        (cue) => {
          cue.setFrame(frameOf(args));
        }
      );
    },
    args: { scene: 'countdown', beat: 2, grade: 'perfect' },
    argTypes: {
      scene: {
        control: 'select',
        options: ['countdown', 'brake', 'graded', 'noReference'],
      },
      beat: { control: { type: 'range', min: 1, max: 3, step: 1 } },
      grade: {
        control: 'select',
        options: [
          'perfect',
          'good',
          'early',
          'late',
          'veryEarly',
          'veryLate',
          'noBrake',
        ],
      },
    },
  }),
};

export default meta;

type Story = StoryObj<StoryArgs>;

export const Countdown: Story = {};

export const Brake: Story = { args: { scene: 'brake' } };

export const GradedPerfect: Story = {
  args: { scene: 'graded', grade: 'perfect' },
};

export const GradedLate: Story = { args: { scene: 'graded', grade: 'late' } };

/** By metres: the plate counts the distance down instead of 3-2-1. */
export const Meters: Story = { args: { layout: 'meters' } };

/** Every optional row on: zone pips, the target pressure, the timing row. */
export const WithDetails: Story = {
  args: {
    scene: 'graded',
    grade: 'late',
    showPips: true,
    showTarget: true,
    showTiming: true,
  },
  parameters: { widgetFrame: { height: 130 } },
};

export const NoReference: Story = { args: { scene: 'noReference' } };
