![Solitaire](../public/icon.svg)

# Solitaire

A calm, tactile game of **draw-one Klondike solitaire** designed for Hosty Shell. It runs entirely
in the browser, works with mouse, keyboard, and touch controls, and keeps the active table on the
local browser profile.

## What it does

- **Classic draw-one Klondike** — build tableau columns downward in alternating colors, move aces
  through kings to four suit foundations, and recycle the waste without a redeal limit.
- **Flexible card controls** — drag a card or valid run, click or tap a source and destination, or
  double-click a card to send it to a legal foundation.
- **Helpful commands** — start a new deal, undo up to 80 actions, highlight a productive move, or
  automatically move cards that are currently safe for foundation play.
- **Responsive Hosty layout** — the board adapts card size and overlap to the available Shell
  viewport, supports fullscreen play, and compacts its controls on narrow screens.
- **Accessible motion** — deal and victory animations respect the browser's reduced-motion
  preference.
- **Local persistence** — the current deal and lightweight statistics are restored from validated,
  schema-versioned browser storage. Invalid or incompatible data starts a fresh game safely.

## Using it

Install Solitaire from Marketplace and open it from the Hosty sidebar. Use the command rail or the
keyboard shortcuts `N` (new deal), `Z` (undo), `H` (hint), `A` (auto), and `F` (fullscreen).

The game has no accounts, server-side storage, external mounts, required settings, or network
integrations. Progress remains on the browser profile where the game is played.
