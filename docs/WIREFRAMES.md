# AXXA Inspector — UI Wireframes

The panel is a right-sidebar `ItemView`. Header + breadcrumb are sticky; the
tab strip selects the active panel; the body scrolls.

## Overall shell

```
┌──────────────────────────────── AXXA Inspector ───────────────────────────┐
│ [▣ Inspect] [◎ Isolate] [✕ Exit]                                  (header) │
├────────────────────────────────────────────────────────────────────────── │
│ body › div.workspace › div.workspace-split › Status Bar       (breadcrumb) │
├────────────────────────────────────────────────────────────────────────── │
│ ⟨Inspect⟩ ⟨Styles⟩ ⟨DOM⟩ ⟨Variables⟩ ⟨Sheets⟩ ⟨Mutations⟩ ⟨Sandbox⟩ ⟨Layout⟩│
├────────────────────────────────────────────────────────────────────────── │
│                                                                            │
│                          (active tab body)                                 │
│                                                                            │
└────────────────────────────────────────────────────────────────────────── ┘
```

## Inspect tab (Features 1, 4, 15)

```
┌ Box model ───────────────────────────────┐
│ content 240×24      padding 0 8 0 8       │
│ border 0 0 0 0      margin 0 0 0 0         │
│ z-index 15                                │
└───────────────────────────────────────────┘
┌ Visual identification ────────────────────┐
│ [Red][Green][Blue][Pulse][Flash][Outline] │
│ [Dim others][Hide][Remove][Isolate][Focus]│
│ [⚠ Revert all on element]                  │
└───────────────────────────────────────────┘
┌ Copy ─────────────────────────────────────┐
│ [Copy Selector][Copy XPath][Copy DOM path] │
│ [★ Favourite]                              │
└───────────────────────────────────────────┘
```

## On-canvas overlay (Feature 1)

```
        ┌─ margin (orange band) ───────────────────┐
        │  ┌─ border ───────────────────────────┐  │
        │  │  ┌─ padding (green band) ────────┐  │  │
        │  │  │      content (accent fill)    │  │  │
        │  │  └───────────────────────────────┘  │  │
        │  └─────────────────────────────────────┘  │
        └───────────────────────────────────────────┘
   ▝ div · 240×24 · z:15   ◀ tooltip (size + z-index)
```

## Styles tab (Features 2, 3)

```
[Undo][Redo][⚠ Reset element]

┌ Layout ───────────────────────────────────┐
│ display       [ flex            ]          │
│ position      [ sticky          ] ●edited  │
│ z-index       [ 15              ]          │
└───────────────────────────────────────────┘
┌ Matched rules (4) ────────────────────────┐
│ [THEME] .status-bar      Minimal.css (0,0,1,0)
│    color: var(--text-muted)               │
│ [CORE] .status-bar       app.css  (0,0,1,0)│
│    ~~background: #1e1e1e~~  (overridden)   │
└───────────────────────────────────────────┘
┌ Export ─ [JSON][CSS][MARKDOWN][TYPESCRIPT][CSV]
```

## DOM tab (Feature 6)

```
┌ Search DOM ──────────────────────────────┐
│ [ .status-bar____________________ ]       │
│ 3 match(es)                               │
│  ▸ Status Bar · div.status-bar            │
│  ▸ div.status-bar-item                    │
│  ▸ div.status-bar-item.plugin-word-count  │
└───────────────────────────────────────────┘
```

## Mutations tab (Feature 7)

```
[● Record] [Clear]
┌ Timeline (42) ────────────────────────────┐
│ 12:04:51  ▎Added <div>                     │
│ 12:04:51  ▎class changed on <body>         │
│ 12:04:50  ▎Removed <span>                  │
└───────────────────────────────────────────┘
[JSON][CSV][MARKDOWN] export
```

## Sandbox tab (Feature 12)

```
[+ New experiment]
┌───────────────────────────────────────────┐
│ [ Fullscreen tweak______ ] [On] [⚠ Delete] │
│ ┌───────────────────────────────────────┐ │
│ │ .status-bar { display: none; }        │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

## Layout tab (Feature 10)

```
┌ Layout overlays ──────────────────────────┐
│ [Flex][Grid][Scroll][Sticky][Fixed]        │
│ [Absolute][Overflow][Stacking]             │
│ [Padding][Margins][Safe areas]             │
│ [⚠ Clear all overlays]                     │
└───────────────────────────────────────────┘
```

## Mobile (Feature 18)

Buttons grow to ≥36 px touch targets; hover-only affordances become tap; the
overlay follows the last tap rather than continuous pointer move; known
desktop-only diagnostics hide when *graceful degradation* is on.
