# Solitaire Game

Status: Archived
Created: 2026-07-13
Updated: 2026-07-13

## Motivation

Create a polished, self-contained web version of Klondike solitaire that runs as a Hosty runtime app and feels natural on desktop and touch devices.

## Possible Approaches

### DOM card layout

Pros:

- Native accessibility semantics are straightforward.
- Individual cards are easy to inspect in browser developer tools.

Cons:

- Dragging and responsive pile geometry require substantial DOM coordination.
- Deterministic visual testing is harder when layout depends on many individual elements.

### Canvas game board with DOM controls

Pros:

- Provides precise, responsive card geometry and animation.
- Supports deterministic rendering and the web-game test hooks.
- Keeps the game board visually consistent inside the Hosty Shell viewport.

Cons:

- Requires explicit keyboard support and a text-state representation for accessibility and automation.

## Risks

- Small Hosty Shell viewports may make seven tableau columns difficult to read.
- Drag-and-drop and tap-to-select interactions can conflict unless pointer state is modeled explicitly.
- Restoring an older saved game requires a versioned persistence format.

## Open Questions

- Which solitaire ruleset should the first release implement?
  - Answer: Standard Klondike with draw-one stock, alternating-color descending tableau runs, suit-ascending foundations, and unlimited stock redeals.
  - Recommendation: Keep draw-three and limited redeals out of the first release so the rules and test surface remain focused.
- Which runtime profiles should the Hosty manifest expose?
  - Answer: A default local development profile and a Docker profile backed by a locally built image.
  - Recommendation: Avoid referencing an unpublished registry image; document the local Docker image build command instead.
- Where should game progress be stored?
  - Answer: Use versioned browser local storage because the game is single-player and needs no server-side data.
  - Recommendation: Do not request Hosty app data or identity capabilities until a cross-device feature requires them.

## Current Recommendation

Build the canvas-board approach with small DOM controls, pure JavaScript game-state functions, versioned local persistence, and both Hosty local-command and local Docker runtime profiles.

## Links

- [Implemented feature: Solitaire Game](../features/solitaire-game.md)

## Notes

The initial release is intentionally offline-capable and has no external runtime dependencies.
