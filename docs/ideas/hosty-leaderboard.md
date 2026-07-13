# Hosty Leaderboard

Status: Promoted
Created: 2026-07-13
Updated: 2026-07-13

## Motivation

Give players a shared leaderboard that identifies them through their existing Hosty account while preserving the game's current low-friction, offline-capable play experience.

## Possible Approaches

### Client-reported personal bests

The browser submits the completed deal's time and move count to a Hosty-authenticated app API. The server stores one best result per Hosty user and rejects duplicate submissions for the same deal.

Pros:

- Fits the current client-side game architecture with a small server extension.
- Keeps gameplay responsive and available while Hosty Core is temporarily unavailable.
- Requires no database dependency.

Cons:

- A technically capable user can forge completion metrics in the browser.
- Duplicate protection prevents accidental resubmission but is not anti-cheat protection.

### Server-verified game sessions

The server issues every ranked deal and validates a complete action transcript against the rules engine before recording the result.

Pros:

- Makes leaderboard results substantially harder to forge.
- Provides an authoritative completion record.

Cons:

- Changes deal creation, restore, and offline behavior.
- Requires a versioned action-log protocol and substantially more test coverage.
- Still needs additional controls against automated solvers and replay abuse.

## Risks

- Hosty identity sessions expire and must recover correctly in both Shell iframe and standalone modes.
- A leaderboard based on browser-reported results is suitable for friendly competition, not adversarial ranking.
- User display names can be missing or duplicated; stable Hosty user ids must remain the storage key.
- Concurrent writes must not corrupt the app-owned leaderboard file.
- Test-only victory scenarios must never publish scores.

## Open Questions

- What should determine leaderboard order?
  - Answer: Not yet approved.
  - Recommendation: Rank each user's fastest completed deal first, then fewer moves, then the earlier achievement time.
- How much anti-cheat protection is required?
  - Answer: Not yet approved.
  - Recommendation: Start with client-reported personal bests for this private Hosty app, clearly treating the board as a friendly leaderboard. Defer server-verified sessions unless competitive integrity is required.
- Should Hosty authentication be required to play?
  - Answer: Not yet approved.
  - Recommendation: Keep gameplay available without a current Hosty session; require an active Hosty identity only to load or submit leaderboard results.

## Current Recommendation

Add an optional Hosty-authenticated leaderboard with one personal best per user, persistent app-owned JSON storage, an accessible score-sheet panel, and graceful authentication recovery. Preserve local game saves and statistics as the offline fallback.

## Links

- [Implementation planning](../planning/hosty-leaderboard.md)
- [Current Solitaire behavior](../features/solitaire-game.md)

## Notes

The existing `Wins` counter remains browser-local. The shared leaderboard represents authenticated personal-best completions rather than a synchronized copy of all local statistics.
