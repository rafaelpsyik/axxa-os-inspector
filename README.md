# AXXA Inspector

**A visual DOM & CSS DevTools experience for Obsidian plugin and theme creators.**

Instead of the slow loop —

> DevTools → Find element → Modify CSS → Copy → Reload → Repeat

AXXA Inspector gives you a native developer workflow inside Obsidian:

> **Inspect → Experiment → Validate → Export → Save**

Inspect, manipulate, understand and experiment with Obsidian's UI architecture
in real time, without ever opening Electron DevTools.

---

## Highlights

| Area | What you get |
|---|---|
| 🔍 **Inspect mode** | Chrome-DevTools-style hover highlight with full box-model overlay (content / padding / margin), size & z-index readout, click-to-freeze, breadcrumb navigation. |
| 🎨 **CSS inspector** | Grouped computed styles, matched rules with **origin** (theme / snippet / plugin / core), **specificity ranking** and override detection. |
| ✏️ **Live editing** | Edit any property instantly, with per-property / per-element / global reset and a full **undo / redo** stack. |
| 🧪 **Visual identification** | Red / green / blue highlight, pulse, flash, outline, dim-others, hide, remove, isolate, focus — every action fully reversible. |
| 🫥 **Isolation mode** | Hide everything except a component and its ancestors, with safe one-click restore. |
| 🌳 **DOM explorer** | Search by tag / class / id / text, jump-to-element, live tree. |
| 📈 **Mutation tracking** | Real-time timeline of added/removed nodes, class/attribute/style changes; record & export sessions. |
| 🎚️ **Theme variables** | Discover every CSS custom property, see origin & usage count, live-edit and export sets. |
| 📄 **Stylesheet explorer** | Per-sheet rule/selector counts, origin, likely-unused selectors. |
| 📐 **Layout debugging** | Visualise flex / grid / scroll / sticky / fixed / absolute / overflow / stacking-context / safe-area elements at once. |
| 🧠 **Obsidian intelligence** | Friendly labels — *"Status Bar"*, *"Reading View"* — instead of raw selectors. |
| 🧬 **Experiment sandbox** | Named, groupable, toggleable CSS experiments injected live; save / import / export presets. |
| 📦 **Export system** | JSON · CSS · Markdown · TypeScript · CSV, with copy-to-clipboard everywhere. |
| 💾 **Persistence** | Experiments, settings, favourites, pins and saved selectors restored across sessions. |

See [`docs/`](docs/) for the full architectural blueprint.

---

## Install (development)

```bash
npm install
npm run dev      # watch build → main.js
npm run build    # type-check + minified production bundle
npm test         # run the unit suite
```

Symlink or copy `manifest.json`, `main.js` and `styles.css` into
`<vault>/.obsidian/plugins/axxa-inspector/` and enable the plugin.

## Usage

1. Click the **AXXA Inspector** ribbon icon (or run *“Open inspector panel”*).
2. Hit **Inspect**, hover the UI, and click to freeze a selection.
3. Switch tabs — **Styles**, **DOM**, **Variables**, **Sheets**, **Mutations**,
   **Sandbox**, **Layout** — to inspect, edit, experiment and export.

## Safety

AXXA Inspector never executes arbitrary JavaScript, never touches Obsidian's
internal APIs, and never persists destructive changes automatically. Every
modification lives strictly within CSS / inline-style / DOM-inspection
boundaries and is fully reversible. See
[`docs/RISK_ANALYSIS.md`](docs/RISK_ANALYSIS.md).

## License

[MIT](LICENSE) © AXXA Studio Lab
