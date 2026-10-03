# Dashboard surface

Mode: Operate. Scope: all dashboard routes and focused game view.

The owner delegated design decisions and approved React, TypeScript, SCSS and both themes. Implementation is code first under that authorization.

Grounded directions, ranked: club room architecture; tournament broadcast typography; federation handbook; chess study jacket; museum wayfinding; sports results print; Swiss tournament pairing sheet.

Challengers: exposure sheets declined for legibility, retain disciplined tonal separation; developer console competitive for state clarity, retain strict action grouping; catalog sleeve declined for hidden labels, retain confident negative space; grid specimen declined for oversized type, retain alignment; character catalog declined for playful distraction, retain clear individual entries; airport signage competitive for wayfinding, retain concise actionable labels.

## Direction contract

THESIS: A chess operator sees complete games immediately, then accounts and execution state. Game boards own the surface; statistics occupy one restrained horizontal band.

OWN-WORLD: Swiss pairing print translated to a pine-tinted rail, crisp paper or forest grounds, muted green chess squares, compact sans typography and tabular clocks. Lines group related data; no display typography or decorative dashboard tiles.

STORY: Connect accounts, choose limits and depth, start a session, watch independent games and diagnose recovery without exposing secrets.

FIRST VIEWPORT: A 216px navigation rail contains session and theme actions. The workspace starts directly with a compact session summary and full board grid; there is no workspace header, live-game filter, or duplicated navigation title. Recently finished and History use smaller board grids. Empty state teaches account setup and offers a clearly marked preview. Expanded view removes chrome and history, wraps every active board within viewport width.

FORM: Candidate 7, Swiss tournament pairing sheet; seed 1beafa1c. Standard web navigation and controls. Signature interaction: Expand clears secondary content and reflows all active games into a board wall, while clocks continue and each account retains its own board orientation.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
