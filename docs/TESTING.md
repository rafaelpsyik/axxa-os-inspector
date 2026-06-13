# AXXA Inspector — Testing Strategy

## Layers

| Layer | Tooling | What it covers |
|---|---|---|
| **Unit (pure)** | Vitest (node env) | specificity calculator, export serialisers, selector/spacing math, persistence migration. No DOM needed. |
| **Unit (DOM)** | Vitest + `jsdom`/`happy-dom` | `DOMAnalysisEngine.describe/buildTree/search`, `CSSEngine` rule matching, `ObsidianTopology` label matching, `OverlayManager` geometry. |
| **Integration** | Vitest + fabricated workspace DOM | inspect→select→render flow via the `EventBus`; undo/redo stack; isolation enter/exit restores DOM exactly. |
| **Manual / smoke** | Real Obsidian vault | hover fidelity, modal/popover inspection, mobile touch, enable/disable leak checks. |

## Current coverage (this repo)

- `tests/specificity.test.ts` — cascade math, ranking, formatting.
- `tests/export.test.ts` — CSS/TS/CSV/Markdown serialisation + CSV escaping.
- `tests/mocks/obsidian.ts` — minimal Obsidian API stub so engines import under Node.

Run with:

```bash
npm test          # vitest run
npm run test:watch
```

## High-value tests to add next

1. **Migration** — feed a v0-shaped blob to `PersistenceLayer` and assert a
   complete, defaulted `AxxaPluginData` out.
2. **Undo/redo invariants** — apply N edits, undo N, assert inline styles match
   the pre-edit baseline; redo restores.
3. **Isolation reversibility** — snapshot `document.body.outerHTML`, isolate,
   exit, assert byte-identical restore.
4. **Selector round-trip** — for a fabricated tree, `buildUniqueSelector(el)`
   must `querySelector` back to exactly `el`.
5. **Observer teardown** — start recording, dispose engine, assert the observer
   is disconnected (spy on `disconnect`).
6. **EventBus isolation** — a throwing handler must not prevent siblings firing.

## Quality gates (CI)

```
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # eslint
npm test            # vitest run
npm run build       # esbuild production bundle must succeed
```

## Manual leak protocol

Toggle the plugin off/on 20×, toggle inspect 20×, and record/stop mutations 10×;
the JS heap (after GC) and active-resource count must return to their baselines.
