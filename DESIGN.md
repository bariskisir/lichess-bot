---
name: lichess-bot
description: 'A compact chess operator workspace in pine and paper.'
colors:
  background: '#111b17'
  surface: '#18251f'
  surface-alt: '#203028'
  text: '#e7eee8'
  muted: '#a0b1a6'
  line: '#2b3b31'
  line-strong: '#496153'
  accent: '#a3c7a8'
  accent-hover: '#b9d7bc'
  on-accent: '#14251a'
  positive: '#a3c7a8'
  warning: '#d3b77d'
  danger: '#efa29a'
  danger-soft: '#3a2726'
  hover: '#24362c'
  selected: '#294234'
  rail: '#162b22'
  rail-text: '#e0ece3'
  rail-muted: '#a2b6a9'
  rail-accent: '#b0cfb0'
  rail-line: '#2a4135'
  rail-hover: '#213b2e'
  rail-selected: '#2b4838'
  light-background: '#f4f6f2'
  light-surface: '#fff'
  light-surface-alt: '#e9eee6'
  light-text: '#22332a'
  light-muted: '#596b60'
  light-line: '#d7e0d4'
  light-line-strong: '#97aa9a'
  light-accent: '#315d43'
  light-accent-hover: '#244b35'
  light-on-accent: '#fff'
  light-positive: '#315d43'
  light-warning: '#866017'
  light-danger: '#a23e34'
  light-danger-soft: '#f9e9e6'
  light-hover: '#eef3e9'
  light-selected: '#e1ebdc'
  light-rail: '#e6ede2'
  light-rail-text: '#22332a'
  light-rail-muted: '#506453'
  light-rail-accent: '#315d43'
  light-rail-line: '#ccd8c7'
  light-rail-hover: '#dce7d5'
  light-rail-selected: '#d0dfc8'
  board-light: '#dce4d1'
  board-dark: '#7d977c'
  board-last: 'rgb(238 210 108 / 38%)'
  board-coordinate: '#000'
  board-check: '#b9574f'
  evaluation-dark: '#403d39'
  evaluation-light: '#fff'
typography:
  headline:
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: '1.75rem'
    fontWeight: 600
    letterSpacing: '-0.025em'
  title:
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: '1rem'
    fontWeight: 600
  section-title:
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: '0.9375rem'
    fontWeight: 600
  body:
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: '0.75rem'
    fontWeight: 400
  metadata:
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: '0.6875rem'
    fontWeight: 400
  button:
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 600
    lineHeight: 1.3
  clock:
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 600
  brand:
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: '1.0625rem'
    fontWeight: 700
    letterSpacing: '-0.025em'
rounded:
  board: '3px'
  clock: '4px'
  evaluation: '5px'
  theme: '6px'
  control: '7px'
  identity: '8px'
  card: '12px'
  dialog: '14px'
spacing:
  board-gap: '0.5rem'
  grid-gap: '1rem'
  completed-grid-gap: '0.875rem'
  live-card-inset: '0.625rem'
  compact-card-inset: '0.5rem'
  workspace-top: '1.5rem'
  workspace-side: '2rem'
  form-gap: '2.5rem'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '0.55rem 0.9rem'
    height: '2.5rem'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '0.55rem 0.9rem'
    height: '2.5rem'
  button-secondary-hover:
    backgroundColor: '{colors.hover}'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '0.55rem 0.9rem'
    height: '2.5rem'
  button-danger:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.danger}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '0.55rem 0.9rem'
    height: '2.5rem'
  button-danger-hover:
    backgroundColor: '{colors.danger-soft}'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    padding: '0.55rem 0.75rem'
    height: '2.5rem'
  navigation-item:
    textColor: '{colors.rail-muted}'
    rounded: '{rounded.control}'
    padding: '0.65rem 0.75rem'
    height: '44px'
  navigation-item-active:
    backgroundColor: '{colors.rail-selected}'
    textColor: '{colors.rail-text}'
  pool-chip:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.theme}'
    padding: '0.5rem 0.7rem'
  pool-chip-selected:
    backgroundColor: '{colors.selected}'
  game-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.card}'
    padding: '{spacing.live-card-inset}'
  game-card-compact:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.card}'
    padding: '{spacing.compact-card-inset}'
    width: '224px'
  game-clock:
    backgroundColor: '{colors.surface-alt}'
    textColor: '{colors.muted}'
    typography: '{typography.clock}'
    rounded: '{rounded.clock}'
    padding: '0.15rem 0.35rem'
  game-clock-active:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.text}'
  game-clock-low:
    backgroundColor: '{colors.danger-soft}'
    textColor: '{colors.danger}'
  evaluation:
    backgroundColor: '{colors.evaluation-dark}'
    rounded: '{rounded.evaluation}'
  theme-button:
    textColor: '{colors.rail-muted}'
    rounded: '{rounded.theme}'
    padding: '0.35rem'
    size: '2rem'
---

# Design System: lichess-bot

## Overview

**Creative North Star: "Swiss Pairing Sheet"**

Swiss pairing print gives lichess-bot its visual character: complete chess positions, tightly aligned player data, muted green squares, and a pine-tinted navigation rail. The interface feels like an operator's working sheet: calm, compact, and legible through repeated games.

Dark forest grounds and light pine paper are equal expressions of the same system. Lines and tonal surfaces group information; short labels, restrained SVG icons, and tabular numbers carry state. The source uses one system UI font stack, with no separate display face.

This record comes from the finished React and SCSS implementation. The accepted world is Candidate 7, seed 1beafa1c; the build was code-led. The source styles remain the implementation authority, with the frontmatter indexing their durable values.

**Key Characteristics:**

- Complete square boards dominate game cards.
- Pine and paper themes change the rail and workspace together.
- Compact labels and tabular clocks make repeated information comparable.
- Fine borders and tonal layering provide depth without shadows.

## Colors

The palette uses muted greens for identity and navigation, with amber and red reserved for meaningful states. Unprefixed frontmatter colors describe the default dark theme; the matching `light-` entries describe the light theme. Shared board and evaluation entries apply in both.

The sidecar's tonal ramps are synthesized panel previews. They do not add colors to the implementation or replace the source theme pairs.

### Primary

- **Pine accent:** Primary actions, positive results, focus outlines, selected controls, and session progress use `accent`, `accent-hover`, `on-accent`, and `positive`, with their light counterparts.
- **Rail pine:** The rail has its own accent, text, hover, selected, and line roles. Its pale paper expression changes with the light workspace.

### Secondary

- **Amber state:** `warning` marks queued, delaying, recovering, and titled-player details. It is a functional state color.

### Tertiary

- **Red state:** `danger` and `danger-soft` mark errors, losses, low clocks, and destructive action feedback. Check uses the shared `board-check` color.

### Neutral

- **Forest and paper grounds:** `background`, `surface`, and `surface-alt` separate the workspace, cards, and small inset controls.
- **Reading and dividing tones:** `text`, `muted`, `line`, and `line-strong` distinguish content, secondary metadata, boundaries, and emphasized strokes.
- **Shared chess materials:** `board-light` and `board-dark` define every board. `board-last` overlays the last-move squares. `board-coordinate` supplies opaque black coordinate labels above squares and overlays.
- **Evaluation contrast:** The shared `evaluation-dark` and `evaluation-light` colors encode the two sides independently of the interface theme.

**The Paired Themes Rule.** Change workspace, controls, and rail together. Board squares and evaluation colors remain shared between themes.

## Typography

**Body and UI Font:** 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif.

**Character:** The source uses compact system typography rather than a display pairing. Weight and alignment carry hierarchy; there is no modular type ratio or separate monospaced font to inherit.

### Hierarchy

- **Headline:** `typography.headline` describes the sign-in heading. It is a limited entry-screen role.
- **Title:** `typography.title` describes ordinary section and form headings; `section-title` describes the smaller Settings group headings.
- **Body:** `typography.body` describes explanatory text. Supporting prose uses observed line heights from 1.6 to 1.7, with shared field help capped at 70ch and Settings descriptions at 28ch on desktop.
- **Label:** `typography.label` describes secondary counts, help, and progress labels. `metadata` describes the narrower game-card and rail metadata.
- **Button and clock:** The separate `button` and `clock` roles retain their semibold compact sizes; clocks use tabular figures.
- **Brand:** `typography.brand` describes the rail wordmark. The suffix has a lighter weight and rail-muted color.

**The Tabular Time Rule.** Use tabular figures for clocks, ratings, game IDs, counts, and progress; preserve player names as the stronger reading line.

## Layout

The desktop shell pairs a fixed-width rail (216px) with a fluid workspace. Workspace padding is 1.5rem at the top, 2rem horizontally, and 2.5rem below. Repeated spacing entries in the frontmatter name measured component roles; the source does not define a shared spacing-variable scale.

Active games use an auto-filling grid with a minimum track of `min(100%, 285px)`, equal remaining widths, and `spacing.grid-gap`. At widths of at least 1800px, the minimum track becomes 320px. Complete boards retain their square aspect ratio. Recently finished and History share an auto-filling grid with minimum tracks of `min(100%, 150px)`, `spacing.completed-grid-gap`, and compact cards capped at 224px.

The session summary is one horizontal band with a bottom rule. It reduces its gaps at 1150px, wraps at 950px, and becomes a two-column status/results and progress/engine arrangement at 500px. It supplies context without introducing statistic tiles.

At 800px and below, the rail becomes a fixed drawer (250px wide). A floating button at the bottom-left opens it; workspace bottom padding makes room for the control. At 600px and below, workspace horizontal padding becomes 1rem. History filters wrap, with search taking the full width at 500px.

Settings have a maximum width of 1100px. Groups pair a description column with a wider field column and `spacing.form-gap`; they stack at 800px. Paired fields stack at 500px. Account rows wrap at 650px. The inspector stacks its position and move-list columns at 600px.

Expand removes the rail, session summary, preview banner, and completed-game grid. Active cards start inside a 0.75rem viewport inset, with no title bar. The collapse button is a compact square (24px) fixed at the absolute top-right corner; Escape exits. Demonstration data retains a small labelled indicator at the bottom-left.

## Elevation & Depth

The implemented system has no drop-shadow vocabulary. Tonal layers and single-pixel strokes provide depth. Hover strengthens the stroke or changes the surface; selected controls use a deeper or more tinted ground. The inspector and mobile drawer use translucent dark backdrops to separate temporary surfaces.

Keyboard focus uses an accent outline (2px) with a 3px offset. The search group uses the same outline with a 2px offset. Backdrop colors, focus treatment, and transition durations live in the sidecar because they are outside the frontmatter component schema.

**The Flat Surfaces Rule.** Use fine borders and tonal changes to distinguish resting, hovered, and selected surfaces. Do not add drop shadows to ordinary cards or controls.

## Shapes

Controls are small rounded rectangles, cards have softer outer corners, and boards keep tight corners. The `rounded` entries record the source's actual radii by role: board, clock, evaluation, theme, control, identity, card, and dialog. Status markers are small circles; they communicate state rather than decoration.

Cards, form panels, inputs, rail boundaries, and divider rows use single-pixel borders. Boards clip their square grid inside the board radius. The expanded collapse control has only its lower-left corner rounded.

## Components

### Buttons

Compact, labelled actions use the shared secondary, primary, ghost, and danger variants. Their frontmatter height records the minimum height, not a fixed content height. The default stroke is `line`; hover uses `line-strong` and `hover`. Primary hover uses `accent-hover`; danger hover uses `danger-soft` with a danger stroke. Ghost actions retain transparent borders. Pressed enabled buttons use `selected`. Disabled buttons lower opacity and use a not-allowed cursor.

The source transitions background and border color over 160ms. Icons are inline SVG, normally 16px inside buttons. The rail theme action is a smaller square beside the app name; session actions remain in the rail footer.

### Chips

Time-control choices are checkbox labels with the `pool-chip` treatment. Selected pools use `selected` and an accent stroke. They wrap with a small gap and keep tabular figures. Disabled groups lower opacity; native checkboxes preserve keyboard behavior.

### Cards / Containers

The `game-card` treatment keeps the board dominant, with a thin line, surface ground, card radius, and compact inset. The header places the time control and game ID together, with status at the top-right. Real IDs link to Lichess; synthetic preview IDs remain plain text.

Player rows surround the board; names are semibold and truncation preserves the clock. Own-player dots use the accent. Clocks use the shared `game-clock`, active, and low-time treatments. Compact completed cards remove clocks and coordinates, reduce padding and player type, and place completion time beneath the lower player.

Account form panels reuse the surface, line, and card radius with more internal space. Settings and Activity are divided groups or rows instead of dashboard cards.

### Inputs / Fields

Text inputs, selects, and textareas use a surface ground, line stroke, control radius, and a minimum height matching buttons. Hover strengthens the stroke; keyboard focus inherits the global outline. Invalid fields use danger borders, with error text beside the field. Disabled fields lower opacity.

Labels sit above fields; explanatory text sits below. Textareas resize vertically. History search has a leading SVG icon and a focus outline around the complete group.

### Navigation

The rail combines concise labels with small SVG icons and optional tabular counts. Default labels use `rail-muted`; hover uses `rail-hover` and `rail-text`; the active route uses `rail-selected`, `rail-text`, and `rail-accent` on its icon. Link rows have a minimum height of 44px.

The mobile drawer keeps the existing rail structure, including theme and session actions. Opening uses a 180ms ease-out translation with a dark backdrop. Route selection closes it; Escape closes it when a dialog is not open.

### Board and evaluation

A board is always a complete eight-by-eight position with the account's orientation. Its opaque black coordinates sit above pieces and move overlays. The left evaluation column and board use a 1:14 track ratio with a small gap; this ratio also applies inside the inspector. Evaluation numbers appear in a tooltip, and stale analysis lowers opacity.

The whole board has a transparent labelled button that opens the existing inspector. The inspector retains move navigation, a scrollable move list, and PGN export; those details remain inside the dialog.

### Preview and empty state

Preview mode names the sample data in a restrained banner; expanded mode keeps a tiny labelled indicator. Empty states use a single outlined chess SVG, a short explanation, and labelled setup or preview actions. They do not introduce a new visual world.

## Do's and Don'ts

### Do:

- **Do** use the matching workspace and rail theme tokens together.
- **Do** keep complete boards square and preserve each account's board orientation.
- **Do** use labelled controls, SVG icons, visible focus outlines, and tabular figures for changing numbers.
- **Do** let settings descriptions and form groups align across columns, then stack them on narrow screens.
- **Do** identify demonstration data wherever the preview is visible.

### Don't:

- **Don't** add display typography, decorative dashboard tiles, or shadows to ordinary surfaces.
- **Don't** reintroduce a workspace header, duplicated navigation title, or search and account filters above live games.
- **Don't** add last-move text, a flip control, or a Review footer to game cards; the board opens the inspector.
- **Don't** turn completed games into a text-only history list; use the compact board grid.
- **Don't** expose evaluation numbers as permanent text beside the board; keep scores in the tooltip.
