# ADR 0017: Smooth motion on the driver's primary telemetry

**Status:** accepted, 2026-11-16
**Amends:** [ADR 0009](0009-overlay-changes-on-one-clock.md)

## Decision

The widgets a driver reads while driving may move between telemetry ticks:
the pedal trace, the proximity radar, the wind direction, the brake point
countdown and the delta sectors' running bar. Each has a `smoothMotion`
setting, **on by default**; off, the widget is back to one change per tick as
ADR 0009 has it. Under `prefers-reduced-motion` it is off whatever the setting.

Every other widget stays on ADR 0009 unchanged.

## How

- Canvas widgets use `useSmoothCanvasLoop` (`src/shared/hooks/`): a tick hands
  over `drawAt(progress)`, and the hook draws it on every display frame from
  the tick (`progress` 0) for one measured bundle interval (`progress` 1), then
  sleeps. With no new telemetry nothing is drawn — a still car or a paused
  session costs nothing.
- What glides: the trace scrolls by the columns a tick added (time axis) or
  the lap position moves from the previous tick's to the new one (distance
  axis); radar cars move from the distance the last tick gave them to the new
  one, a car new to the scope or one that changed lanes is drawn where it is.
- DOM widgets (wind arrow, countdown, sectors) use a CSS transition listed in
  `widget-transitions.test.ts` with this ADR as its reason, or the same hook.

## Why

The user's decision: these are what the driver watches, and a picture that
steps 30 times a second reads worse than one that flows. ADR 0009 measured
what flowing costs — the overlay changing at the monitor's rate made iRacing's
1% low drop and stutters per minute grow (29 widgets: 96–99 fps 1% low at
30 Hz without transitions, 68 with). The cost here is narrower: only these
widgets, only while their data moves, and each can be switched off.

## Consequences

- With one of them on screen and moving, the overlay changes at the monitor's
  rate, not the publication rate. A driver who sees the game's frame time
  suffer turns `smoothMotion` off for that widget (or lowers the monitor rate).
- `perf:game` runs that compare against the ADR 0009 baseline set
  `smoothMotion` off, or record it, so the numbers stay comparable.
