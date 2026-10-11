# Architecture

The system separates chess rules, session coordination, external services, and presentation. Dependencies are assembled in `apps/server/src/main.ts`. Domain contracts describe capabilities; adapters implement them.

```text
apps/
  server/src/
    domain/          Engine, Lichess and chess.com ports; validated chess positions
    application/     Sessions, games, scheduling, configuration, authentication
    adapters/        Lichess, chess.com, local engines, HTTP, authentication, persistence, demo
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
- **AccountRunner** authenticates one lichess.org account, recovers games, and manages pairing.
- **ChesscomAccountRunner** authenticates one chess.com account, seeks rated pools over HTTP, and manages pairing.
- **GameRunner** owns one live Lichess game, recovers authoritative state, and coordinates moves.
- **ChesscomGameRunner** owns one live chess.com game over RSocket, replays TCN moves, and coordinates moves.
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

Four distributions are registered: `lozza-2-local` (default), `lozza-5-local`, `stockfish-10-local`, and `stockfish-19-lite-local`. Each runs in its own child process. `UciEngine` owns identity verification, startup, progress monitoring, deadlines, cancellation, and process cleanup. Distribution descriptors supply each engine's entry point, expected identity, and reference rating. The registry sorts the catalog by rating.

Stockfish runs the pinned npm JS/WASM builds. Lozza's unmodified sources run in a worker-compatible JavaScript context. Its adapter restores coordinate move output after every position command, normalizes mate scores, and provides MultiPV by excluding previous root choices from successive searches. It restores complete position history for each rank and divides timed searches across the requested alternatives. A shortened live deadline retains the latest root candidate and terminates the synchronous Lozza process; a later search creates a replacement. Cancellation also terminates that process.

To add another engine:

1. Implement `ChessEngine` from `apps/server/src/domain/engine/engine.ts` in a new adapter folder. Respect cancellation, position history, and process cleanup.
2. Register its `EngineFactory` in the composition root with a unique ID, display name, and optional reference rating.
3. The dashboard reads the registry catalog automatically. No selector or scheduler changes are needed.
4. Add adapter tests under `tests/unit/engine/`, including legal output, cancellation, and failure recovery.

The pool, move selector, game runners, and scheduler depend on engine interfaces and do not need engine-specific branches. No remote chess-analysis service is present.

## Dashboard transport

The HTTP server hosts React assets and the JSON API on the same local port. Server-Sent Events publish bounded dashboard snapshots; the client preserves unchanged game objects to avoid redrawing every board. Clocks use the server timestamp offset and a shared tick.

Mutations require the dashboard's request header and same-origin requests. Optional password authentication protects dashboard APIs. HTTP and WebSocket transports for both providers use the same configurable browser User-Agent. Account credentials never enter shared dashboard DTOs.

`LichessRetry` centralizes attempt limits, delay, cancellation, permanent-error classification, and server cooldowns. Both gateways inject the same policy into their HTTP adapters and every socket channel. An individual request defaults to three total attempts, 1,000 ms apart. Session recovery remains independent of this bounded transport policy.

## chess.com transport

Match notifications arrive on the pubsub socket (`wss://www.chess.com/pubsub?uid=…`, `pubsub.ts`), subscribed to `matcher/tickets/users/:me`. A ticket flips to `state: accepted` carrying our `color` and the full game transport: region shard, relative RSocket URL and explicit `watch`/`move`/`acknowledgement` routes. RSocket frames (`rsocket.ts`) and TCN moves (`tcn.ts`) follow the ticket, verified against `har/www.chess.com.har`.

- `SETUP` carries `{acknowledgements, authentication: strict, client, userId}`.
- `REQUEST_STREAM games.{uuid}.events` pushes full `{clocks, moves: [[tcn, clockMs]], updatedAt}` states; each push is answered with fire-and-forget `games.{uuid}.acknowledgments`.
- Moves are `REQUEST_RESPONSE games.{uuid}.moves` with `{clock, index, metadata, move: tcn}`; the server confirms with `{updatedAt}` and then broadcasts the new state.
- Server `echo` requests are answered with empty-payload responses; RSocket keepalives run every 2 s.

Moves use TCN encoding (`tcn.ts`): two characters per move from a shared 64-square alphabet, with promotion and drop extensions. Matchmaking stays on HTTP (`POST /service/matcher/seeks/chess`), and pairing polls `GET /service/play/games` for the assigned game before subscribing. Stale seeks are detected through `GET /service/matcher/seeks` (a restart can return an `inactive` seek instead of a fresh one). Newborn seeks also report `inactive` for a while — the only success so far matched 51 s after creation — so a seek is left alone for 5 minutes before being recreated; instant delete-and-recreate churn was observed to prevent matching entirely. The live-game shard varies per game (`play-us-2-5`, `play-eu-1-5`, …): the RSocket URL is built from the game entry's `channel`/`href`/`transports`, never hard-coded. The play-client version constant and per-session token in `chesscom-http.ts` must be refreshed when chess.com ships a new play bundle.

Terminal game states arrive in-band as a per-player `results` array (`['win', 'resigned']`, `players[0]` is White), which also carries resignations and timeouts; vanished games without results are recorded as aborted. Player names and ratings come from `playersDetails`. chess.com allows one live game per account, so its runner never searches while a game is active and reports `playing` instead of `searching`.

## Styling

SCSS semantic tokens define both themes. Components reference tokens instead of embedding colors or inline style attributes. Chessboards preserve square geometry at narrow widths; the expanded layout wraps naturally. Impeccable direction and review artifacts live in `.impeccable/`.
