# AXXA Inspector — Risk Analysis & Security

## Security constraints (Feature 19) — how each is enforced

| Constraint | Enforcement |
|---|---|
| **No arbitrary JS execution** | No `eval`, `Function`, `setTimeout(string)`. Experiment input is set as `<style>.textContent` — CSS text cannot run JS. |
| **No Obsidian internal-API mutation** | Engines only read the public DOM and `document.styleSheets`, and call documented `Plugin`/`ItemView` APIs. No reaching into `app.*` internals. |
| **No unsafe `innerHTML`** | UI is built with `createEl`/`createDiv`/`setText`; no string HTML injection of untrusted data. |
| **No auto-persisted destructive change** | Live edits are session-only unless the user opts in (`persistEdits`). “Remove” keeps a re-insert handle. Isolation/visual tests are reversible class toggles. |
| **No elevated permissions** | `manifest.json` requests nothing beyond a standard plugin; storage is `Plugin.saveData` only. |

## Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Memory leak** from observers/listeners on long sessions | Med | High | All resources on `DisposableGroup`; `MutationObserver` always `disconnect()`ed; inspect mode tears down listeners when off. |
| R2 | **Layout thrash** while highlighting | Med | Med | rAF-coalesced overlay draws; throttled hover; bounded tree traversal (`maxNodes`). |
| R3 | **Cross-origin stylesheet access** throws | High | Low | Every `sheet.cssRules` read is wrapped in try/catch and skipped gracefully. |
| R4 | **Brittle generated selectors** (volatile state classes) | Med | Med | `selector.ts` filters volatile classes (`is-*`, `hover`, `active`) and falls back to `:nth-of-type`. |
| R5 | **Self-inspection feedback loop** (inspector mutates DOM the observer watches) | Med | Med | `isOwnUi()` filter ignores `.axxa-*` nodes; inspector skips its own overlay/panel in hit-testing. |
| R6 | **Inspecting modals/popovers** that close on outer click | Med | Med | Capture-phase listeners + `preventDefault` on the inspecting click; Escape un-freezes before disabling. |
| R7 | **Huge DOM** (10k+ nodes) freezing tree/search | Low | High | Tree depth+node caps; search result limit; unused-selector scan capped at 50. |
| R8 | **Persisted edits corrupt UX** after theme change | Low | Med | `persistEdits` is opt-in and inline-only; “Reset all” always available. |
| R9 | **Mobile** lacks pointer hover / DevTools parity | High | Low | Platform detection + graceful degradation; touch-sized controls; tap-to-inspect. |
| R10 | **Schema drift** breaking old data | Low | Med | Versioned payload + defensive forward-merge migration. |
| R11 | **Color/contrast accessibility** | Med | Med | High-contrast mode, customisable overlay colours, `prefers-reduced-motion` honoured. |

## Failure containment

- `EventBus.emit` isolates handler exceptions (one bad listener can't break others).
- `DisposableGroup.dispose` swallows individual teardown errors so one failure
  can't strand the rest.
- `PersistenceLayer` logs (never throws) on a failed final flush during unload.
