# Solitaire Game

Created: 2026-07-13
Updated: 2026-07-13

## Overview

Solitaire is a browser-based, draw-one Klondike game packaged as a Hosty runtime app. It renders the playing table in one responsive canvas and uses semantic HTML controls for game-level actions.

## Rules

- A shuffled 52-card deck deals one through seven cards into the tableau columns. Only the top card of each column starts face up; the remaining 24 cards form the stock.
- Tableau columns build downward in alternating colors. A face-up card and every valid card below it move as one run.
- Empty tableau columns accept kings only.
- Foundations build upward by suit from ace through king.
- The stock draws one card at a time. When it is empty, the waste can be recycled without a redeal limit.
- Removing a tableau card or run automatically turns the newly exposed top card face up.
- Moving all 52 cards to the foundations wins the game.

## Controls

Cards support pointer drag-and-drop, click or tap selection followed by a destination, and double-click movement to a legal foundation. Pointer capture keeps drag state consistent if the pointer leaves the canvas.

The command rail provides:

- **New deal** (`N`) — starts a freshly shuffled game.
- **Undo** (`Z`) — restores the previous state from a bounded 80-action history.
- **Hint** (`H`) — highlights a legal source and destination, preferring productive moves.
- **Auto** (`A`) — moves currently safe cards to their foundations as one undoable action.
- **Fullscreen** (`F`) — toggles the Hosty game surface between embedded and fullscreen modes; `Escape` exits fullscreen.

## Interface

The board uses a green baize palette, porcelain cards, an oxblood card back, and muted brass foundation outlines. The opening cards use a staggered deal animation, while the completed game shows a reduced victory panel and optional confetti.

The layout continuously derives card size and overlap from the available Hosty Shell viewport. At narrow widths the command rail compacts into two rows and the card art switches to a smaller rank-and-suit treatment. Reduced-motion preferences disable deal and confetti movement.

## State and Persistence

The rules engine is independent from rendering and uses stable card ids, seeded shuffling, immutable undo snapshots, and explicit legal-move results. The current game includes stock, waste, foundations, tableau, moves, redeals, elapsed time, and status.

The browser stores a schema-versioned active-game payload and separate lightweight statistics. Restore validation checks all 52 cards, unique ids, face state, tableau order, foundation order, and status. Missing, malformed, or incompatible storage creates a new game without blocking the UI.

Persistence is local to the browser profile. Cross-device synchronization and server-side accounts are not supported.

## Hosty Runtime

The `app.0.1` manifest defines one `web` service and one public HTTP endpoint used by the Shell entrypoint.

- The default `dev` profile is a source-backed `localCommand` runtime. Hosty runs the production build setup, injects a dynamic port, and starts the Node static server on loopback.
- The `docker` profile runs the local `hosty-solitaire:0.1.0` image, listens on container port 3000, and includes an executable HTTP health check.

The app does not request Hosty identity, app data, settings, external mounts, telemetry, or privileged capabilities. It reads `PORT`, `HOSTY_PORT_HTTP`, and `HOSTY_APP_ID` when provided.

## Automation Interface

`window.render_game_to_text()` returns the visible cards, pile counts, hit rectangles, selection, hint, animations, available actions, and a CSS-pixel coordinate-system description. `window.advanceTime(ms)` advances the timer and visual state in deterministic steps for browser automation.

## Current Limitations

Draw-three games, limited redeals, scoring variants, daily challenges, leaderboards, accounts, and shared progress are not supported.

## Links

- [Originating idea](../ideas/solitaire-game.md)
- Planning: `docs/planning/solitaire-game.md` (completed and removed according to the Completion Rule)
