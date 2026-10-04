# Architecture

The system separates chess rules, session coordination, external services, and presentation. Dependencies are assembled in `apps/server/src/main.ts`. Domain contracts describe capabilities; adapters implement them.

```text
apps/
  server/src/
    domain/          Engine and Lichess ports; validated chess positions
    application/     Sessions, games, scheduling, configuration, authentication
    adapters/        Lichess, Stockfish, HTTP, authentication, persistence, demo
    config/          Explicit launch options for isolated test servers
    shared/          Cancellation, retry, and asynchronous coordination
  web/src/
    app/             Dashboard shell and navigation
    features/        Games, history, accounts, settings, auth, themes, activity
    shared/          API client, live state, and reusable UI
    styles/          SCSS theme tokens and global styles
packages/contracts/ Shared validated settings and dashboard DTOs
tests/              Unit/integration tests, fixtures, browser tests
scripts/            Build and review helpers
```

Related production components, helpers, and SCSS live together in their feature folders. Tests live exclusively under `tests/`.

## Backend boundaries

- **BotRuntime** owns the session lifecycle and shared resources.
- **AccountRunner** authenticates one account, recovers games, and manages pairing.
- **GameRunner** owns one live game, recovers authoritative state, and coordinates moves.
- **MatchBudget** reserves unique-game and search capacity.
- **EnginePool** schedules searches across a fixed number of lazily created workers through an interchangeable scheduling policy.
- **ConfigurationService** validates changes against a repository port.
- **AuthenticationService** manages optional passwords and expiring sessions through repository and hashing ports.
- **DashboardStore** publishes secret-free game, account, runtime, and activity projections.

Game histories retain the initial FEN and full move sequence so engines can reason about repetition. Analysis is cancelled when the game position changes. Network retries and engine process failures stay within their owning adapter or worker.

`ClockPriorityScheduling` picks the earliest current clock deadline whenever a worker becomes free. Game runners provide a live deadline callback for every search, including deeper evaluation and alternative verification. Equal deadlines and missing clocks retain arrival order. Search cutoffs are separate from clock urgency, so a long game does not outrank an account whose clock is about to expire merely because its artificial delay is shorter.

The `application/game/timing/` folder owns move timing. `calculateDynamicTurnBudget` is a pure policy for equal clock allocation, future increments, rolling move forecasts, and safety reserves. `TurnTiming` selects dynamic or random timing and updates it from authoritative clocks. `TurnDelay` measures elapsed time monotonically from the start of a turn, including connection and queued analysis. Recovering the same position preserves that target. `MoveSelectionBudget` bounds all search stages together and cancels exhausted queued work, retaining a legal fallback. Stockfish honors a separate live search cutoff with UCI time limits and can return partial analysis while retaining its worker.

Configuration, password hashes, and history use serialized atomic JSON writes. Invalid persisted files fail explicitly instead of silently replacing user data.

## Add an engine

Three Lite distributions are registered: `stockfish-19-lite-local` (default), `stockfish-18-lite-local`, and `stockfish-17-lite-local` (Stockfish 17.1). Each uses an explicitly versioned single-threaded build in its own child process. A distribution descriptor selects the package, entry file, and expected UCI identity without duplicating engine lifecycle code.

To add another engine:

1. Implement `ChessEngine` from `apps/server/src/domain/engine/engine.ts` in a new adapter folder. Respect cancellation, position history, and process cleanup.
2. Register its `EngineFactory` in the composition root with a unique ID and display name.
3. The dashboard reads the registry catalog automatically. No selector or scheduler changes are needed.
4. Add adapter tests under `tests/unit/engine/`, including legal output, cancellation, and failure recovery.

The pool, move selector, game runners, and scheduler depend on engine interfaces and do not need engine-specific branches. No remote chess-analysis service is present.

## Dashboard transport

The HTTP server hosts React assets and the JSON API on the same local port. Server-Sent Events publish bounded dashboard snapshots; the client preserves unchanged game objects to avoid redrawing every board. Clocks use the server timestamp offset and a shared tick.

Mutations require the dashboard's request header and same-origin requests. Optional password authentication protects dashboard APIs. HTTP and WebSocket Lichess transports use the same configurable browser User-Agent. Account credentials never enter shared dashboard DTOs.

`LichessRetry` centralizes attempt limits, delay, cancellation, permanent-error classification, and server cooldowns. The gateway injects the same policy into its HTTP adapter and every socket channel. An individual request defaults to three total attempts, 1,000 ms apart. Session recovery remains independent of this bounded transport policy.

## Styling

SCSS semantic tokens define both themes. Components reference tokens instead of embedding colors or inline style attributes. Chessboards preserve square geometry at narrow widths; the expanded layout wraps naturally. Impeccable direction and review artifacts live in `.impeccable/`.
