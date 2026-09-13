# Chart motion

All existing quantitative chart families now have finite entrance motion. Recorded values, units, dates, axis labels and reference bands remain steady. New data can replay its plotted layer; there is no invented fluctuation or looping heartbeat in a clinical record.

| Platform | Coverage |
| --- | --- |
| Web | Clinical line and area plots with staged data points, home mini-bars, earnings splits, forecast fills, funding allocations, dispatch share bars, verification progress and segmented completion charts. The shared controller discovers charts in lazy-loaded workspaces and responds to changed plot data. |
| iOS | Clinical lines and points reveal together; snapshot bars rise into position. Earnings splits, verification progress and segmented completion use a shared native reveal. Data identity changes reset the plotted layer without resetting its labels or table. |
| Android | Clinical canvas lines and points, snapshot bars, earnings splits and verification progress use native drawing/transform animations. Changes to the plotted data restart the finite reveal. |

Web animations stop when reduced motion is enabled, when the document is hidden or when the shared decorative-motion state is paused. Offscreen plots settle without running in the background. iOS respects Reduce Motion and scene state; Android respects Remove animations. Each entrance takes about a second, including small staggered delays. Animations change the drawing, not clinical values or verification decisions.

The motion policy follows [W3C reduced-motion guidance](https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html) and [Apple's motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion).

## Verification

- Eight focused desktop/mobile chart checks passed, inspecting changing rendered stroke offsets, stable values and range geometry, real mini-bar animations, lazy-loaded earnings charts, data changes, reduced motion and table access. Supporting earnings, dashboard and motion regressions passed as well.
- Android instrumentation passed: actual chart pixels change during reveal, a completed plot stays unchanged, and its table opens with the recorded value.
- The iPhone trends accessibility audit passed at normal and maximum Dynamic Type sizes.
- Web checks/build and both native builds passed; Android lint passed. Existing web bundle-size and iOS AppIntents metadata advisories remain.
