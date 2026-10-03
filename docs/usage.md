# Dashboard and sessions

## Start a session

1. Add your Lichess sessions in **Accounts**.
2. Choose time controls, game limits, and engine settings in **Settings**.
3. Select **Start session**.

Accounts are authenticated and ongoing games are recovered before new pairings begin. The scheduler reserves capacity for searches as well as games. Each game has an independent connection and cancellation scope; all games share a bounded local engine pool.

## Session controls

| Control        | Behavior                                                                |
| -------------- | ----------------------------------------------------------------------- |
| Start session  | Authenticate accounts, recover games, and start pairing                 |
| Pause pairing  | Stop new searches; continue existing games                              |
| Resume pairing | Start searching again within session limits                             |
| Finish session | Stop new searches and finish ongoing games                              |
| Stop now       | Disconnect immediately and stop local analysis; games remain on Lichess |

After **Stop now**, starting again recovers eligible ongoing games. Disconnecting does not resign games, and clocks continue on Lichess. A completed game between two managed accounts counts once toward the session target.

## Live games

Game cards put the complete board first, with compact player and clock details above and below it. Time control and game ID sit at the top left, with Thinking/Waiting at the top right. The game ID beside its time control opens the match on Lichess; selecting the board opens its inspector. Evaluations are shown from White's perspective; an older position's evaluation is marked as stale. The evaluation bar sits on the left and scales with the board. Its fill follows the sibling chessanalyzer app and the account's board orientation. The bar has no visible score text; hovering reveals the score and depth.

**Expand** shows only ongoing games and arranges complete boards in wrapping rows. History and navigation are hidden. There is no horizontal board strip. Use the small collapse icon at the top right or **Escape** to return to the workspace. Expanded boards start at the top with no title bar.

## History and inspection

**Recently finished** shows up to six completed games as a grid of smaller boards. **History** uses the same board grid for all retained games, with search and result filters. Select a board to open its game inspector, replay moves, or export PGN. Lichess links use public game identifiers rather than private player URLs.

## Move selection

**Best move** uses the engine's first legal result. **Balanced alternatives** considers multiple candidates and verifies plausible alternatives more deeply before choosing. Mistake selection uses its configured probability and retained-advantage threshold; it does not guarantee a mistake every time the probability condition fires. Forced winning mates take priority. All analysis runs locally.

**Search depth** controls the initial candidate search (default 7). **Evaluation depth** controls the deeper root evaluation when alternatives or mistakes are enabled (default 15). Candidate verification uses the greater of evaluation depth and search depth. The dashboard evaluation belongs to the original position, rather than an alternative position's verification search.

Clocks, position updates, and accepted moves come from Lichess. The board does not advance optimistically when a move is sent. Disconnections trigger retry and position recovery; stale analysis is cancelled before a changed position is played.

Queued engine searches prioritize the account with the earliest clock expiry. Clock updates are checked again whenever a worker becomes available; equal deadlines retain arrival order. An already running search is allowed to finish.

**Maximum delay** sets a random total target from the moment the application receives your turn. Queue waiting, connection setup, candidate search, and deeper evaluation all count toward this target. For a 3-second target and 2 seconds already elapsed, only 1 second remains to wait. If analysis exceeds the target, the move is sent immediately after analysis. Set the maximum to 0 to disable artificial waiting.

## Themes and preview

Use the square theme icon beside the application name in the sidebar to switch between light and dark themes. Your choice is saved in the browser; the first visit follows your operating system preference. Session controls also live in the sidebar. On smaller screens, the navigation button at the bottom left opens this panel.

The empty workspace offers a **dashboard preview** with explicitly labelled sample games. Preview does not contact Lichess and cannot change account or bot settings. Select **Return to workspace** to exit it.

## Password access

Dashboard access is open by default. Set, change, or remove a password in **Settings â†’ Dashboard access**. Signing out protects the dashboard while the backend keeps running. See [configuration](configuration.md#dashboard-password) for storage and recovery details.
