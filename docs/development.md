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

All test files are under `tests/`; production source folders contain no tests. Unit and integration tests cover validation, game history, move confirmation, cancellation, engine queues, Stockfish execution, session budgets, runtime recovery, persistence, HTTP boundaries, and authentication.

Browser tests use local sample data. They check themes, game replay and PGN export, settings, full-board expansion, and responsive widths down to 320 px. The browser server uses a separate port and a test-specific data directory. Verification does not create real Lichess games.

## Conventions

Use English identifiers and user-facing copy, strict TypeScript, explicit capability interfaces, and small cohesive modules. Put styles in SCSS beside their components. Add a new adapter when changing an external service rather than teaching application workers about transport details.

Inject dependencies through constructors. Keep account credentials, private game URLs, and password hashes out of API responses and activity messages. Preserve cancellation propagation and authoritative game-state checks when changing move submission.

## Dependencies

`package-lock.json` pins the installed dependency tree. Use `npm ci` for reproducible installations. Check `npm outdated` when updating packages and run `npm run verify` after changes. The main Stockfish dependency is version 19. The `stockfish-18` and `stockfish-17` aliases deliberately preserve earlier engine distributions; an outdated report for those aliases does not mean they should be upgraded to version 19.

Impeccable is installed at `.agents/skills/impeccable/`. Product context is recorded in `PRODUCT.md`, with the dashboard surface brief under `.impeccable/surfaces/`.
