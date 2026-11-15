# ADR 0014: One Input Trace with a reference overlay; the brake-point countdown is its own widget

**Status:** accepted, 2026-11-14
**Context:** `src/widgets/input-trace`, `src/widgets/brake-point`, `mt-reflaps::cue`

## Decision

- **Input Trace stays one widget.** It gains a setting `showReference`
  (default on): the active reference's throttle and brake are drawn as filled
  areas behind the live lines, lined up by lap distance (`LapDistPct`) and
  running ahead of the car by the trace's look-ahead. Existing modes
  (horizontal/vertical, ABS, wheel, bars) are unchanged. There is no second
  "ITO graph" widget.
- **Brake point is a new widget** (`brake-point`), the port of ITO's second
  window: 3-2-1-BRAKE into each reference brake point, the zone's target peak,
  live pedal gauge, grade of the brake-on (perfect/good/early/late/very/no
  brake), pips per zone. The state machine runs in Rust
  (`mt-reflaps::cue::BrakeCue`) on the telemetry thread and is emitted as one
  small frame per overlay tick; the widget only draws it.
- Grades use the reference lap's clock at the car's lap position, as ITO did,
  so BRAKE always lands on the reference brake point whatever the pace.

## Why

- Two input traces would show the same pedals twice; one with an option keeps
  layouts simple.
- The countdown is a different object (a timer bar, not a graph) and is often
  placed elsewhere on screen — ITO already made it a separate window.
- Computing the cue in Rust keeps the overlay's one-clock rule (ADR-0009) and
  makes the grading testable without a browser.
