import { observer } from 'mobx-react-lite';

import {
  PIT_LIMITER_BIT,
  computeShiftThresholds,
  rpmZoneColorByPct,
} from '@shared/lib/car-signals';
import { useReactiveDomWrite } from '@shared/hooks/useReactiveDomWrite';
import { useBlinkHandle, type BlinkCycle } from '@shared/hooks/useBlink';
import { useWidgetSettings } from '@entities/layout/useWidgetSettings';
import { usePlayerStore } from '@entities/player/player-context';
import { useSessionStore } from '@entities/session/session-context';

import styles from './RevStrip.module.scss';
import type { InputTraceSettings } from '../settings-schema';

const LED_COUNT = 15;

/** The shift light: lit and dim, 60 ms each. */
const SHIFT_BLINK: BlinkCycle = { stepMs: 60, steps: 2 };

/** The pit limiter: the whole strip blue, on and off twice a second. */
const LIMITER_BLINK: BlinkCycle = { stepMs: 250, steps: 2 };

const LED_COLOR = '--led-color';

/**
 * The revs as a strip of lights across the top of the widget, in the gear
 * zones' colours; the whole strip flashes at the shift point, and turns blue
 * while the pit limiter is on. The revs are a hot field, written straight to
 * the lights (see `docs/rendering.md`); flashing goes through `useBlink`.
 */
export const RevStrip = observer(() => {
  const player = usePlayerStore();
  const session = useSessionStore();
  const settings = useWidgetSettings<InputTraceSettings>('input-trace');
  const blink = useBlinkHandle();

  const stripRef = useReactiveDomWrite<HTMLDivElement>(
    (element, scheduleWrite) => {
      // oxlint-disable-next-line no-restricted-properties
      const dynamics = player.carDynamics;
      const rpm = dynamics?.rpm ?? 0;
      const { shiftRpm, blinkRpm } = computeShiftThresholds(
        session.sessionInfo,
        player.carStatus,
        dynamics?.gear ?? 0
      );
      const limiterOn =
        settings.showPitLimiterLights &&
        ((player.carStatus?.engine_warnings ?? 0) & PIT_LIMITER_BIT) !== 0;
      const isShift = !limiterOn && rpm >= shiftRpm;
      const lit = limiterOn
        ? LED_COUNT
        : isShift
          ? LED_COUNT
          : Math.floor(
              Math.min(1, Math.max(0, rpm / (blinkRpm || 1))) * LED_COUNT
            );
      const colors = {
        low: settings.throttleColor,
        mid: settings.absColor,
        high: settings.rpmColorHigh,
        shift: settings.rpmColorShift,
        limit: settings.rpmColorLimit,
      };

      scheduleWrite(() => {
        blink.attach(element);
        blink.run(limiterOn ? LIMITER_BLINK : isShift ? SHIFT_BLINK : null);

        for (let index = 0; index < LED_COUNT; index++) {
          const led = element.children[index];

          if (!(led instanceof HTMLElement)) {
            continue;
          }

          const on = index < lit;
          const color = limiterOn
            ? 'var(--limiter-color)'
            : isShift
              ? colors.shift
              : rpmZoneColorByPct((index + 1) / LED_COUNT, colors);

          led.classList.toggle(styles.on, on);
          led.style.setProperty(LED_COLOR, on ? color : 'transparent');
        }
      });
    },
    [player, session, settings, blink]
  );

  return (
    <div
      ref={stripRef}
      className={`${styles.strip} ${settings.revLightsGlow ? styles.glow : ''}`}
    >
      {Array.from({ length: LED_COUNT }, (_unused, index) => (
        <span key={`led-${index}`} className={styles.led} />
      ))}
    </div>
  );
});
