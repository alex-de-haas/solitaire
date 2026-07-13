# Hosty Solitaire

A responsive draw-one Klondike solitaire game built as a Hosty runtime app. The game runs entirely in the browser, has no runtime package dependencies, and stores the current table locally.

## Gameplay

- Build tableau piles downward in alternating colors.
- Move cards to the four foundations by suit, from ace through king.
- Only kings can move to empty tableau columns.
- Select cards with a click or tap, drag a card or valid run, or double-click a card to send it to its foundation.
- Recycle the waste into the stock without a redeal limit.

The command rail provides New deal, Undo, Hint, and Auto actions. Auto moves only cards considered safe for foundation play. Keyboard shortcuts are `N`, `Z`, `H`, `A`, and `F` for fullscreen.

## Local Development

```bash
npm install
npm run dev
```

The server reads `PORT`, then `HOSTY_PORT_HTTP`, and otherwise uses `4173`. It binds to loopback unless `HOST` is explicitly set.

## Hosty

Install and start the source-backed development profile from the repository root:

```bash
hosty core start
hosty apps install . --runtime dev
hosty apps start com.haas.solitaire
```

For the Docker profile, build the manifest-declared local image first:

```bash
docker build -t hosty-solitaire:0.2.0 .
hosty apps install . --runtime docker
hosty apps start com.haas.solitaire
```

The manifest exposes one public HTTP endpoint and a Hosty Shell entrypoint. Hosty assigns the host port dynamically.

## Verification

```bash
npm test
npm run build
```

With `npm run dev` running in another terminal:

```bash
npm run test:browser
```

The browser smoke check covers pointer drag, click selection, double-click, keyboard actions, undo, stock draw, persistence restoration, hints, new deals, fullscreen, touch input, the narrow layout, and the victory state.

## Persistence

The active game and lightweight statistics use versioned browser local-storage entries. Invalid or incompatible game data is discarded safely and replaced with a new deal. No game data is stored in Hosty app data or sent to a backend.

## Documentation

- [Feature behavior](docs/features/solitaire-game.md)
- [Documentation index](docs/root.md)
