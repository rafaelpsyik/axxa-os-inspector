# AXXA Inspector — Performance Considerations (Feature 16)

## Budget

| State | Target overhead |
|---|---|
| Plugin enabled, inspect **off** | ~0 — no listeners, no observers, no timers running. |
| Inspect **on** | One throttled `pointermove` + one rAF overlay loop. |
| Mutation recording **on** | One `MutationObserver`, debounced batch processing. |

## Techniques in use

1. **Lazy everything.** Engines are constructed on first `resolve()`; the
   overlay/observer DOM doesn't exist until a feature needs it.
2. **Throttle** hover highlighting (`schedule.throttle`, default 16 ms ≈ 60fps).
3. **Debounce** mutation processing (60 ms) and persistence writes (400 ms).
4. **requestAnimationFrame coalescing** for overlay positioning, so scroll/resize
   storms collapse to one draw per frame (`schedule.rafThrottle`).
5. **Bounded traversal.** `DOMAnalysisEngine.buildTree` caps depth (12) and total
   nodes (2000); search caps results (200); unused-selector scan caps at 50.
6. **Capture-phase, single-listener** inspect handlers — attached on toggle-on,
   fully removed on toggle-off (the `group` is recreated each detach).
7. **WeakMap edit storage** keyed by element, so detached elements are GC-eligible
   without manual bookkeeping.
8. **No idle observers.** `MutationObserver` is created on `start()` and
   `disconnect()`ed on `stop()`/`dispose()` — never left running.

## Leak-prevention model

```
plugin.onunload → container.dispose()
   → DisposableGroup.dispose() (LIFO)
       → each engine.dispose()
           → overlay root .remove()
           → observers .disconnect()
           → throttle/debounce .cancel()
           → injected <style> .remove()
           → document.body state classes removed
```

Because every acquisition registers its release on a `DisposableGroup`, the
teardown is exhaustive by construction — there is no manual “remember to clean
up X” list that can drift.

## Diagnostics

`PerformanceMonitor` exposes a `snapshot()` of fps, JS heap (when the runtime
exposes `performance.memory`), live resource count and inspect-active state —
intended for a future Performance panel and used by tests to assert that
disabling inspect mode returns the plugin to idle.

## Verifying idle overhead

1. Enable plugin, **don't** open inspect mode.
2. Confirm no AXXA listeners on `document` (DevTools → Event Listeners).
3. Toggle inspect on/off 20× and watch heap return to baseline (no growth).
4. Record mutations, stop, and confirm the observer count returns to 0.
