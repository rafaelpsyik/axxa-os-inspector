# AXXA Inspector — Architecture

## 1. Design principles

1. **Separation of concerns.** Engines hold logic, the view holds presentation,
   and they never reference each other directly — they communicate over a typed
   `EventBus`.
2. **Dependency injection.** A small `ServiceContainer` constructs every engine
   as a lazy singleton, so collaborators are explicit and engines are unit
   testable with fakes.
3. **Deterministic teardown.** Every listener, timer, observer and injected DOM
   node registers on a `DisposableGroup`. Unloading the plugin disposes the
   container, which cascades teardown in LIFO order — no leaks (Features 16/19).
4. **Pure where possible.** Analysis/serialisation engines (DOM, Export,
   specificity) are pure functions of their input, which keeps them trivially
   testable and side-effect free.
5. **Safety by construction.** All mutations are CSS / inline-style / DOM-class
   operations. There is no `eval`, no internal-API access, no auto-persisted
   destructive change.

## 2. Folder structure

```
axxa-os-inspector/
├── manifest.json            # Obsidian plugin manifest
├── esbuild.config.mjs       # bundler (cjs, externals: obsidian/electron/cm)
├── tsconfig.json            # strict TS, path aliases
├── styles.css               # all .axxa-* styles + body-scoped state classes
├── src/
│   ├── main.ts              # entry: builds container, registers engines + UI
│   ├── core/                # framework primitives
│   │   ├── Disposable.ts     #   DisposableGroup (LIFO teardown)
│   │   ├── EventBus.ts       #   typed pub/sub
│   │   ├── ServiceContainer.ts #  DI container
│   │   └── tokens.ts         #   service tokens
│   ├── engines/             # the eight+ engines (one responsibility each)
│   │   ├── OverlayManager.ts      # Feature 1 — highlight overlay
│   │   ├── InspectorEngine.ts     # Feature 1 — inspect mode + selection
│   │   ├── CSSEngine.ts           # Features 2,3,8,9 — styles/rules/vars/edit
│   │   ├── DOMAnalysisEngine.ts   # Feature 6 — descriptors/tree/search
│   │   ├── VisualTestEngine.ts    # Features 4,5 — visual tests + isolation
│   │   ├── MutationTrackingEngine.ts # Feature 7 — observer + timeline
│   │   ├── LayoutDebugger.ts      # Feature 10 — layout overlays
│   │   ├── ExperimentSandbox.ts   # Feature 12 — live CSS experiments
│   │   ├── ExportEngine.ts        # Feature 13 — JSON/CSS/MD/TS/CSV
│   │   ├── PersistenceLayer.ts    # Feature 14 — versioned, debounced storage
│   │   └── PerformanceMonitor.ts  # Feature 16 — fps/heap diagnostics
│   ├── intelligence/
│   │   └── ObsidianTopology.ts    # Feature 11 — semantic labels
│   ├── ui/
│   │   └── InspectorView.ts       # the tabbed ItemView panel
│   ├── settings/
│   │   ├── defaults.ts            # default data + schema version
│   │   └── SettingsTab.ts         # settings UI (Features 14,17)
│   ├── types/                     # all data models + the event map
│   └── utils/                     # schedule, selector, specificity, dom, …
├── tests/                   # vitest unit suite (+ obsidian mock)
└── docs/                    # this blueprint
```

## 3. Layered view

```
                ┌─────────────────────────────────────────┐
                │              InspectorView (UI)           │
                │  tabs · breadcrumb · panels · export btns │
                └───────────────▲───────────────┬──────────┘
            subscribes (EventBus)│               │ resolve(Token).method()
                                 │               ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │                         ServiceContainer (DI)                       │
   │   EventBus  ·  DisposableGroup  ·  lazy singleton engine registry   │
   └───────────────────────────────────────────────────────────────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
  InspectorEngine  CSSEngine  DOMAnalysis  VisualTest  MutationTracking …
        │
        ▼
   OverlayManager ──▶ document.body (fixed, pointer-events:none overlay)
```

`main.ts` is the only module that knows the concrete wiring; everything else
depends on tokens + interfaces.

## 4. Class responsibilities (summary diagram)

```
DisposableGroup            register(teardown) ; dispose() LIFO
EventBus<AxxaEventMap>      on/once/emit/clear (typed)
ServiceContainer           register(token,factory) ; resolve(token) ; dispose

ObsidianTopology           identify(el) → {label, category} ; nearestRegion(el)

OverlayManager (Disp)      highlight(el) ; hide() ; setColors() — box-model draw
InspectorEngine (Disp)     setActive(b) ; select(el) ; clearSelection()
CSSEngine (Disp)           getComputedStyleGroups ; getMatchedRules ; applyEdit
                           resetProperty/Element ; undo/redo ; getVariables
                           setVariable ; getStylesheets
DOMAnalysisEngine (Disp)   describe ; buildTree ; breadcrumb ; childrenOf ; search
VisualTestEngine (Disp)    apply(el,action) ; revertElement ; isolate ; exit
MutationTrackingEngine     start/stop ; startRecording/stop ; events ; clear
LayoutDebugger (Disp)      toggle(mode) ; activeModes ; clearAll
ExperimentSandbox (Disp)   add/update/toggle/remove ; toPreset ; applyPreset
ExportEngine               export{ElementCss,DomTree,Mutations,Variables,…}
PersistenceLayer (Disp)    init ; settings/productivity/… getters ; set ; flush
PerformanceMonitor (Disp)  startSampling ; snapshot ; trackResources
```

## 5. Data flow examples

**Inspect → select → render styles**

1. User toggles inspect → `InspectorEngine.setActive(true)` attaches capture-
   phase pointer/click listeners and emits `inspect-mode-changed`.
2. Pointer move (throttled) → `OverlayManager.highlight(el)` draws the box model
   via `requestAnimationFrame`; `hover-element` emitted.
3. Click → `preventDefault`, selection frozen, `selection-changed` emitted.
4. `InspectorView` hears `selection-changed`, asks `CSSEngine` for grouped
   computed styles + matched rules and `DOMAnalysisEngine` for the breadcrumb,
   then renders.

**Live edit**

`InspectorView` input `onchange` → `CSSEngine.applyEdit(el, prop, value)` sets
an inline style, pushes onto the undo stack, emits `css-edited` +
`history-changed` (which re-enables the undo button).

## 6. Persistence model

A single versioned `AxxaPluginData` blob (`schemaVersion`, `settings`,
`productivity`, `experiments`, `presets`, `recordings`, `lastSelection`) is
stored through Obsidian's `Plugin.saveData`. `PersistenceLayer.migrate()` runs a
defensive forward-merge on load so older payloads upgrade cleanly. Writes are
debounced (400 ms) and force-flushed on unload.

## 7. Event contract

`src/types/events.ts` is the canonical list of inter-module messages
(`inspect-mode-changed`, `hover-element`, `selection-changed`,
`navigate-to-element`, `css-edited`, `history-changed`, `mutation-recorded`,
`visual-test-changed`, `isolation-changed`, `experiments-changed`, `notice`).
Adding cross-module behaviour means adding a typed entry here.
