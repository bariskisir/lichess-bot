# Setup and configuration

Install Node.js 24 or newer, run `npm install`, and start with `npm run dev`. The frontend and backend share **http://localhost:4173**. For a compiled build, run `npm run build` followed by `npm start`.

## Accounts

In **Accounts**, add a label and the `lila2` session value from your Lichess account. You can enter the value alone or `lila2=value`. Do not paste an entire cookie header. Adding an account stores the session locally; authentication happens when you start the bot. Account session values are never returned to the dashboard.

The application uses authenticated Lichess website sessions and its real-time protocol. This is a website integration rather than the official Bot API; upstream website changes may require adapter updates. Use accounts and games where engine assistance is permitted under [Lichess terms](https://lichess.org/terms-of-service).

## Default settings

| Setting                           | Default                   |
| --------------------------------- | ------------------------- |
| Engine                            | `stockfish-19-lite-local` |
| Depth                             | 7                         |
| Evaluation depth                  | 15                        |
| Engine workers                    | 3                         |
| Concurrent games                  | 4                         |
| Session game target               | 100                       |
| Move selection                    | Balanced alternatives     |
| Dynamic delay                     | Enabled                   |
| Manual maximum total turn delay   | 1,000 ms (dynamic off)    |
| Candidate variations              | 10                        |
| Mistake probability               | 25%                       |
| Retained advantage for mistakes   | 2 pawns                   |
| Hash per worker                   | 64 MB                     |
| Saved games                       | 200                       |
| Draw between managed accounts     | Enabled                   |
| Claim victory for absent opponent | Enabled                   |
| Lichess request attempts          | 3 total attempts          |
| Retry interval                    | 1,000 ms                  |

The default selection is **1+0, 2+1, 3+0, 3+2, 5+0, 5+3**. The **10+0, 10+5, 15+10, 30+0, 30+20** pools remain available but start unselected. Only standard, real-time chess is supported.

The large engine selector offers **Stockfish 19 Lite**, **Stockfish 18 Lite**, and **Stockfish 17.1 Lite**. Version 19 is the default; earlier Lite distributions are explicit alternatives installed under npm aliases. They share the same UCI adapter, worker pool, and move-selection behavior.

Defaults apply to new configurations and **Restore defaults**. Existing saved settings are retained. Finish a running session, or use **Stop now**, before editing bot settings and accounts. Dashboard password management stays available during a session.

**Dynamic delay** also defaults to enabled when loading older configurations that do not contain this setting. It ignores and disables **Maximum delay**, retaining that value for manual mode. See [move timing](usage.md#move-timing) for clock allocation and time-pressure behavior.

## Dashboard password

The dashboard has **no password by default** and listens only on a loopback address. In **Settings → Dashboard access**, set a password of 8–128 characters. You stay signed in; other dashboards must sign in again. Changing or removing an existing password requires the current password. **Sign out** ends your browser session without stopping games.

Passwords are stored as salted scrypt hashes in `data/dashboard-auth.json`. Sessions use opaque, HttpOnly, SameSite=Strict cookies and expire after 12 hours. Server restart ends existing sessions. Login attempts are limited to five per minute per local client address.

If you lose the password, stop the application, rename `dashboard-auth.json` inside your data directory, and restart. The dashboard will open without a password. Account configuration and game history remain in their own files.

## Application settings

Everything is configured in the dashboard; the application does not load environment variables or .env files.

**Settings → Application** includes the browser User-Agent, dashboard port, retry attempts and interval, log level, and automatic session startup. The browser User-Agent is shared by Lichess HTTP and WebSocket connections. It does not identify itself as lichess-bot. Port changes require restarting the application; the dashboard stays local to this machine. Log level changes apply immediately. Automatic startup uses the saved accounts and settings on the next launch.

All Lichess HTTP calls and WebSocket handshakes use one retry policy: **three total attempts**, with **1,000 ms** between failed attempts. It retries network errors, timeouts, HTTP 408/425/429 and server errors, supports cancellation, and honors Retry-After. A 429 response creates a shared per-account cooldown of at least one minute. Authentication failures and permanent client errors fail immediately. After exhausted attempts, running game/account workers retain their recovery lifecycle. Submitted game actions are reconciled against authoritative position updates before replaying them.

## Local data

Settings and account session values are stored in `data/configuration.json`; game history is stored separately. Session values need to remain recoverable for website authentication and are stored in plaintext on your machine. Keep the data directory private. Data, logs, build output, and test artifacts are excluded from Git.

Structured logs are written under `logs/` with the startup date in their filename. Dashboard activity is a bounded recent view, rather than the full log file.
