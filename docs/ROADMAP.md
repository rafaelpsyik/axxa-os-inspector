# AXXA Inspector — Implementation Plan, Roadmap & MVP

## MVP definition (ship-worthy minimum)

The minimum that delivers the core *Inspect → Experiment → Validate → Export*
loop:

- **M1** Inspect mode with box-model overlay + size/z-index tooltip (Feature 1)
- **M2** Click-to-select, breadcrumb navigation (Feature 1)
- **M3** Computed styles + matched rules with origin & specificity (Feature 2)
- **M4** Live CSS editing with reset + undo/redo (Feature 3)
- **M5** Obsidian semantic labels (Feature 11)
- **M6** Export selected element CSS (subset of Feature 13)
- **M7** Session persistence of settings + edits (Feature 14)

> Status in this repository: **M1–M7 implemented**, plus Features 4, 5, 6, 7, 8,
> 9, 10, 12, 15 (partial) and 16–19 foundations.

## Phased implementation plan

### Phase 0 — Foundation ✅
- Project scaffold (esbuild, strict TS, manifest, CI-ready scripts).
- Core primitives: `DisposableGroup`, `EventBus`, `ServiceContainer`, tokens.
- Type system (`src/types/*`) and the event contract.

### Phase 1 — Inspect & overlay (MVP core) ✅
- `OverlayManager` (rAF-driven box model + tooltip).
- `InspectorEngine` (capture-phase hover/click, freeze, Escape handling).
- `ObsidianTopology` semantic labels.
- `DOMAnalysisEngine.describe/breadcrumb`.

### Phase 2 — CSS intelligence (MVP core) ✅
- `CSSEngine`: grouped computed styles, matched-rule enumeration with origin
  classification, specificity ranking, override detection.
- Live editing + undo/redo + resets.
- `specificity.ts` calculator (Feature 15).

### Phase 3 — Experimentation & identification ✅
- `VisualTestEngine` (11 reversible actions + isolation).
- `ExperimentSandbox` (live `<style>` injection, presets).
- `LayoutDebugger` (11 overlay modes).

### Phase 4 — Discovery & tracking ✅
- `DOMAnalysisEngine.buildTree/search` (DOM explorer).
- `CSSEngine.getVariables/getStylesheets` (variable & sheet explorers).
- `MutationTrackingEngine` (observer, timeline, recordings).

### Phase 5 — Export & persistence ✅
- `ExportEngine` (JSON/CSS/MD/TS/CSV across all subjects).
- `PersistenceLayer` (versioned, debounced, migrating).
- Settings tab + accessibility controls.

### Phase 6 — Productivity & polish (in progress)
- Selector/XPath/DOM-path copy ✅, favourites ✅.
- Quick-actions command palette, selector pinning UI, recent inspections list.
- Element screenshot export (desktop, via `html-to-image`-style canvas).
- Virtualised DOM tree for very large subtrees.

## Advanced feature roadmap (post-1.0)

| Theme | Idea |
|---|---|
| **Diffing** | Snapshot a component's computed styles, mutate, then diff — “what changed and why”. |
| **Time-travel** | Scrub the mutation timeline and replay DOM/class changes. |
| **Theme authoring** | One-click generate a `theme.css` skeleton from edited variables. |
| **Specificity coach** | Suggest the *minimal* selector to win a cascade battle. |
| **Snippet bridge** | Promote a sandbox experiment straight into a vault CSS snippet file. |
| **Collaborative presets** | Shareable `.axxa-preset.json` packs for teams. |
| **Profiling** | Per-engine timing surfaced in the Performance panel. |

## Release checklist

- [ ] `npm run build` clean (tsc + esbuild)
- [ ] `npm test` green
- [ ] Manual smoke test on desktop + mobile
- [ ] `versions.json` / `manifest.json` bumped
- [ ] No console errors on enable/disable cycles (leak check)
