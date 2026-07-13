# Hosty Leaderboard

Status: Draft
Created: 2026-07-13
Updated: 2026-07-13

## Goal

Add a shared Solitaire leaderboard whose entries are keyed to stable Hosty user identities and persist in Hosty's app data directory.

## Scope

- Exchange Hosty app authorization codes for an app-origin HttpOnly identity cookie.
- Revalidate app identity through Hosty Core before reading or writing user-specific leaderboard data.
- Store one personal-best completion per Hosty user in the app data directory.
- Show a responsive, keyboard-accessible leaderboard panel inside the existing Solitaire interface.
- Submit a completion once per real deal and update the panel when the result improves the user's personal best.
- Preserve local saves, local statistics, and unauthenticated gameplay.
- Handle embedded Shell recovery, standalone recovery, access denial, and temporary Core outages.

## Out of Scope

- Global internet leaderboards or cross-Host federation.
- Server-authoritative deal generation, action-transcript replay, anti-bot controls, or competitive anti-cheat guarantees.
- App-owned roles, administrator score editing, seasons, daily challenges, and historical match lists.
- Synchronizing the active game or local `Wins` counter across browsers.

## Current Behavior

Solitaire is a zero-dependency Node static server with a canvas game client. Active games and statistics are stored only in browser `localStorage`. Hosty identity, app data, and server APIs are not currently used. A victory updates local statistics when game status first changes to `won`; automated `scenario=won` pages are visual fixtures.

## Target Behavior

The game remains playable when Hosty identity is unavailable. An authenticated player can open a `Leaders` score-sheet panel showing the top ten personal bests and their own rank. On the first valid completion of a deal, the client submits the deal id, elapsed milliseconds, and move count. The server derives the user id and display label from a revalidated Hosty session, enforces input bounds and per-user deal idempotency, and atomically stores an improved personal best.

## Acceptance Criteria

- [ ] Opening Solitaire through Hosty Shell establishes an app-local session tied to the current Hosty user.
- [ ] The leaderboard shows rank, player display label, completion time, and move count for up to ten personal bests.
- [ ] Ranking uses the approved ordering and returns the authenticated player's rank even when outside the top ten.
- [ ] A user's stored entry changes only when a submitted completion improves their personal best.
- [ ] The same user and deal id cannot record the same victory more than once.
- [ ] Automated victory fixtures and restored already-won games do not submit leaderboard results.
- [ ] Missing or expired identity does not block gameplay and exposes a working Hosty sign-in/recovery action.
- [ ] Core `403` displays access denied without a redirect loop; Core outage retains the cookie and offers retry.
- [ ] Leaderboard writes survive app restart and use Hosty's backup-managed app data directory.
- [ ] Existing pointer, touch, keyboard, undo, stock, persistence, fullscreen, responsive-layout, and victory flows continue to pass.

## Deliverables

- [ ] Hosty app-session exchange, cookie, revalidation, and recovery implementation.
- [ ] Persistent leaderboard repository with atomic writes, input validation, ranking, and deal idempotency.
- [ ] Authenticated leaderboard HTTP API.
- [ ] Leaderboard score-sheet UI and responsive states.
- [ ] Victory submission integration and automation-state reporting.
- [ ] Manifest app-data and backup capability configuration.
- [ ] Unit, API, browser, and Hosty runtime tests.
- [ ] Feature documentation reflecting implemented behavior.

## Technical Design

### Identity and session

- `POST /api/auth/app-code` accepts a one-time `code`, exchanges it through `{HOSTY_CORE_ORIGIN}/api/auth/apps/token`, and stores the opaque token in an app-specific HttpOnly cookie.
- Cookie `Max-Age` follows Core's `expiresInSeconds`. Plain HTTP uses `SameSite=Lax` without `Secure`; HTTPS uses `SameSite=None; Secure`, derived from `X-Forwarded-Proto` or the request URL.
- API requests read the cookie and call `{HOSTY_CORE_ORIGIN}/api/auth/apps/revalidate` with `Authorization: Bearer {HOSTY_APP_SERVICE_TOKEN}`. The server uses the returned stable `userId` as the storage key and `displayName` as the preferred label.
- Recoverable `401` clears the cookie. Terminal `403` preserves a denied state. Timeout or network failure maps to `503` and keeps the cookie.
- The browser removes `code` from the URL after exchange. Embedded recovery posts `hosty:auth-required` to the Shell parent; standalone recovery uses `HOSTY_CORE_PUBLIC_ORIGIN` and a once-per-tab loop guard.

### Leaderboard API and storage

- `GET /api/leaderboard` returns `leaders`, the current user's entry/rank, and identity status. Results expose display labels, never email addresses or identity tokens.
- `POST /api/leaderboard` accepts `dealId`, `elapsedMs`, and `moves` only after a successful Hosty revalidation.
- Store versioned JSON at `{HOSTY_APP_DATA_DIR}/leaderboard.json`; serialize in-process updates and replace the file atomically through a temporary sibling file.
- Each user record stores stable Hosty user id, current display label, personal-best metrics, achievement timestamp, and a bounded set of submitted deal ids for idempotency.
- Validate identifiers and numeric ranges, cap request body size, reject malformed JSON, and never trust a client-supplied user id or display name.

### Game integration

- Create and persist an opaque deal id with each normal new deal.
- Trigger submission only on a real `playing` to `won` transition, never for `scenario` fixtures or initial restoration of a won game.
- Keep local saves and statistics unchanged if authentication or leaderboard submission fails.
- Extend `window.render_game_to_text()` with concise leaderboard panel, identity, loading, and submission states.

### Interface design

- Add a semantic `Leaders` button to the command rail. It opens a DOM score-sheet over the canvas: a restrained green-black ledger with brass rank markers and porcelain rows that belongs to the existing card-table material language.
- Reuse the current Baskerville/Georgia display face, system body face, and compact utility labels. Keep the existing baize, porcelain, oxblood, ink, and brass tokens rather than introducing a second visual system.
- Desktop uses a right-side score sheet; narrow layouts use a bottom sheet. The sheet contains a real HTML table, visible focus treatment, an explicit close action, loading/empty/error states, and reduced-motion behavior.
- The signature element is a small brass-edged `personal best` row pinned below the top ten when the current player ranks outside it.

## Risks

- Client-reported results can be forged and are not suitable for an adversarial competitive leaderboard.
- Core availability becomes a dependency for leaderboard operations, though not for gameplay.
- The current server has no routing or cookie helpers, so auth parsing and response handling require security-focused tests.
- JSON storage supports a single app process; running multiple writable replicas would require a transactional database or file lock shared across processes.
- Undoing and re-winning the same deal can currently increment local wins; leaderboard deal idempotency must prevent duplicate shared submissions without changing existing local statistics unexpectedly.

## Open Questions

- What should determine leaderboard order?
  - Answer: Pending user approval.
  - Recommendation: Fastest elapsed time, then fewer moves, then earliest achievement.
- How much anti-cheat protection is required?
  - Answer: Pending user approval.
  - Recommendation: Use validated client-reported personal bests for the first Hosty-local version; keep server-verified sessions out of scope.
- Should Hosty authentication be required to play?
  - Answer: Pending user approval.
  - Recommendation: No. Require identity only for leaderboard access and submission so existing offline play remains intact.

## Implementation Phases

### Phase 1: Hosty identity and persistence foundation

- [ ] Add app-session exchange/revalidation and recovery contracts.
- [ ] Add the versioned atomic leaderboard repository and API tests.
- [ ] Enable Hosty app data and backup/restore capabilities.

### Phase 2: Game and interface integration

- [ ] Add deal identity and idempotent win submission.
- [ ] Build the responsive score-sheet UI and automation state.
- [ ] Add authenticated, unauthenticated, error, mobile, and victory browser coverage.

### Phase 3: Validation and documentation

- [ ] Run unit, build, browser, prescribed web-game client, Docker, and Hosty lifecycle checks.
- [ ] Validate a direct identity probe and persistent leaderboard behavior across restart.
- [ ] Update feature documentation and apply the Completion Rule.

## Verification

- `npm test`
- `npm run build`
- `npm run test:browser`
- Prescribed `web_game_playwright_client.js` interaction bursts with screenshot and text-state inspection.
- Docker image build and container health check.
- `hosty apps install . --runtime dev`, app health/log checks, and an identity token probe for an assigned Hosty user.
- Submit a ranked completion, restart the app, and confirm the same personal best remains.

## Links

- [Originating idea](../ideas/hosty-leaderboard.md)
- [Current Solitaire behavior](../features/solitaire-game.md)

## Notes

The app version remains unchanged until a Pull Request is prepared for merge, in accordance with repository versioning rules.
