# lichess-bot

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, TypeScript, SCSS, Node.js and npm, explicitly requested by the owner. Architecture and implementation decisions are delegated to the developer.

## Users

The owner runs and monitors local Lichess automation. Multiple accounts and simultaneous games are established capabilities of the original application.

## Product Purpose

Run local chess engines, manage account sessions, recover interrupted games and make ongoing games easy to watch.

## Operating Context

Started with npm on a local machine. Lichess web sessions join standard quick-pairing pools. The incumbent lives in the sibling lichess-bot directory; it supplies protocol evidence, not a mandatory visual identity.

## Capabilities and Constraints

- Stockfish 19 Lite is the default; the owner also requested nearby Lite alternatives. Stockfish 18 Lite and 17.1 Lite are selectable. Engines remain replaceable through a port and registry.
- Expand shows ongoing games only, with complete boards and no horizontal scrolling.
- Recently finished games and History use a smaller board grid. Live cards keep compact metadata around the board, with no last-move text, flip controls, or Review row. Public game IDs link to Lichess.
- Live games have no search or account filter. The workspace header is removed; themes and session controls live in the sidebar.
- Evaluation bars sit on the left, scale with their boards, and show score text only in a tooltip.
- Both light and dark themes are required, with a persistent theme switch.
- English source code, colocated feature files, separate SCSS, and extensible SOLID architecture.
- No chess-api.com integration.
- Keep README short, in the style of the sibling aichat README; link detailed documentation.
- All configuration is managed inside the dashboard; no environment variable support.
- Dashboard access is password-free by default, with password management in Settings.
- Tests live under the root tests folder, outside production source folders.
- Defaults: search depth 7, evaluation depth 15, 3 workers, 4 concurrent games, balanced alternatives, 1000 ms maximum delay, 10 variations, 25% mistake chance, and the six 1â€“5 minute pools selected.
- Shared HTTP and WebSocket request retries default to three attempts, 1000 ms apart.
- Engine queues prioritize live clock deadlines, with arrival order as the tie breaker. Artificial delay is a total turn target that includes queue and analysis time.

## Brand Commitments

The product name is lichess-bot. The owner requests professional execution and delegates feature and visual decisions.

## Evidence on Hand

Original TypeScript service and React dashboard in ../lichess-bot. Real game data is unavailable during development; any preview data must be identified as demonstration data.

## Product Principles

- Ongoing games receive the most space.
- Make lifecycle controls and failure recovery understandable.
- Keep credentials on the server and out of public projections.
- Keep chess rules, scheduling, external transports and rendering independent.

## Open Decisions

Assumption: local single-operator use is the primary deployment. Remote administration requires an additional authentication layer.
