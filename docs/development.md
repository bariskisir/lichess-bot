# Development

## Commands

| Command                | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | Watch backend TypeScript and serve React through Vite |
| `npm run build`        | Clean and build server and frontend into `dist/`      |
| `npm start`            | Run the compiled application                          |
| `npm run check`        | Strict TypeScript and Oxlint checks                   |
| `npm test`             | Unit and integration tests                            |
| `npm run test:watch`   | Watch unit/integration tests                          |
| `npm run test:e2e`     | Playwright browser tests                              |
| `npm run verify`       | Type/lint checks, tests, build, browser tests         |
| `npm run format`       | Format source, tests, and documentation               |
| `npm run format:check` | Check formatting                                      |

Before the first browser test, install Chromium:

```bash
npx playwright install chromium
```

## Tests

All test files are under `tests/`; production source folders contain no tests. Unit and integration tests cover validation, game history, move confirmation, cancellation, engine queues, real Stockfish and Lozza execution, session budgets, runtime recovery, persistence, HTTP boundaries, and authentication. Engine tests include legal coordinate PVs, timed results, cancellation, and recovery; Lozza tests also cover mate, promotion, and sole legal moves.

Browser tests use local sample data. They check themes, game replay and PGN export, settings, full-board expansion, and responsive widths down to 320 px. The browser server uses a separate port and a test-specific data directory. Verification does not create real Lichess games.

## Conventions

Use English identifiers and user-facing copy, strict TypeScript, explicit capability interfaces, and small cohesive modules. Put styles in SCSS beside their components. Add a new adapter when changing an external service rather than teaching application workers about transport details.

Inject dependencies through constructors. Keep account credentials, private game URLs, and password hashes out of API responses and activity messages. Preserve cancellation propagation and authoritative game-state checks when changing move submission.

## Dependencies

`package-lock.json` pins the installed dependency tree. Use `npm ci` for reproducible installations. Check `npm outdated` when updating packages and run `npm run verify` after changes. The main `stockfish` dependency is version 19; `stockfish-10` pins `stockfish@10.0.2` under an npm alias and must retain that engine version.

Lozza's unchanged sources and accompanying upstream notices are vendored from [Lozza 2.0](https://github.com/namanthanki/lozza/tree/3c222b28b76e0e3dc3e5fa417e8aae15642dc114) and [Lozza 5](https://github.com/namanthanki/lozza/tree/3ef2967740e7e1103078531b8b83eb49ceff3b2a). Update the pinned sources rather than editing them. `scripts/copy-engine-assets.ts` includes these assets in compiled server builds.

Impeccable is installed at `.agents/skills/impeccable/`. Product context is recorded in `PRODUCT.md`, with the dashboard surface brief under `.impeccable/surfaces/`.
