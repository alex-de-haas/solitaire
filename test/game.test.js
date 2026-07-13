import test from "node:test";
import assert from "node:assert/strict";

import {
  SUITS,
  autoMoveToFoundations,
  createDeck,
  createGame,
  deserializeGame,
  drawStock,
  findHint,
  formatCard,
  isValidTableauRun,
  moveCards,
  serializeGame,
  undoMove,
  validateGame
} from "../public/game.js";

function arrangedGame({ tableau = [], waste = [], foundations = {} } = {}) {
  const available = new Map(createDeck().map((card) => [card.id, card]));
  const take = (id, faceUp) => {
    const card = available.get(id);
    assert.ok(card, `Card ${id} must be available`);
    available.delete(id);
    return { ...card, faceUp };
  };

  const foundationPiles = Object.fromEntries(SUITS.map((suit) => {
    const count = foundations[suit.key] || 0;
    return [suit.key, Array.from({ length: count }, (_, index) => take(`${suit.short}${index + 1}`, true))];
  }));

  const tableauPiles = Array.from({ length: 7 }, (_, pileIndex) => (tableau[pileIndex] || []).map((entry) => {
    const [id, faceUp = true] = Array.isArray(entry) ? entry : [entry, true];
    return take(id, faceUp);
  }));
  const wastePile = waste.map((id) => take(id, true));
  const stock = [...available.values()].map((card) => ({ ...card, faceUp: false }));
  const status = SUITS.every((suit) => foundationPiles[suit.key].length === 13) ? "won" : "playing";

  return {
    schemaVersion: 1,
    seed: 99,
    status,
    stock,
    waste: wastePile,
    foundations: foundationPiles,
    tableau: tableauPiles,
    moves: 0,
    redeals: 0,
    elapsedMs: 0,
    lastAction: "Test layout",
    history: []
  };
}

test("a seeded deal contains every card and follows Klondike deal geometry", () => {
  const game = createGame(12345);

  assert.equal(validateGame(game), true);
  assert.deepEqual(game.tableau.map((pile) => pile.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(game.stock.length, 24);
  assert.ok(game.tableau.every((pile) => pile.at(-1).faceUp));
  assert.ok(game.tableau.every((pile) => pile.slice(0, -1).every((card) => !card.faceUp)));
});

test("the seeded shuffle is deterministic", () => {
  const first = createGame(42);
  const second = createGame(42);
  const different = createGame(43);

  assert.deepEqual(first.stock.map(formatCard), second.stock.map(formatCard));
  assert.notDeepEqual(first.stock.map(formatCard), different.stock.map(formatCard));
});

test("drawing and recycling the stock are undoable", () => {
  const original = createGame(7);
  const drawn = drawStock(original);

  assert.equal(drawn.moved, true);
  assert.equal(drawn.state.stock.length, 23);
  assert.equal(drawn.state.waste.length, 1);
  assert.equal(drawn.state.waste.at(-1).faceUp, true);

  const undone = undoMove(drawn.state);
  assert.equal(undone.moved, true);
  assert.deepEqual(undone.state.stock, original.stock);
  assert.equal(undone.state.moves, 0);

  const allWaste = arrangedGame({ waste: createDeck().map((card) => card.id) });
  const recycled = drawStock(allWaste);
  assert.equal(recycled.moved, true);
  assert.equal(recycled.state.stock.length, 52);
  assert.equal(recycled.state.waste.length, 0);
  assert.equal(recycled.state.redeals, 1);
  assert.ok(recycled.state.stock.every((card) => !card.faceUp));
});

test("tableau moves build down in alternating colors", () => {
  const game = arrangedGame({ tableau: [["H9"], ["C10"], ["D10"]] });
  assert.equal(validateGame(game), true);

  const legal = moveCards(game, { type: "tableau", pile: 0, cardIndex: 0 }, { type: "tableau", pile: 1 });
  assert.equal(legal.moved, true);
  assert.deepEqual(legal.state.tableau[1].map(formatCard), ["10C", "9H"]);

  const illegal = moveCards(game, { type: "tableau", pile: 0, cardIndex: 0 }, { type: "tableau", pile: 2 });
  assert.equal(illegal.moved, false);
  assert.match(illegal.error, /alternating colors/i);
});

test("moving a run reveals the newly exposed tableau card", () => {
  const game = arrangedGame({ tableau: [[ ["S6", false], "H5" ], ["C6"]] });
  const moved = moveCards(game, { type: "tableau", pile: 0, cardIndex: 1 }, { type: "tableau", pile: 1 });

  assert.equal(moved.moved, true);
  assert.equal(moved.state.tableau[0].at(-1).id, "S6");
  assert.equal(moved.state.tableau[0].at(-1).faceUp, true);
  assert.equal(isValidTableauRun(moved.state.tableau[1]), true);
  assert.equal(validateGame(moved.state), true);
});

test("foundations accept only the next card of the matching suit", () => {
  const game = arrangedGame({ waste: ["H1", "D2"] });
  const wrong = moveCards(game, { type: "waste" }, { type: "foundation", suit: "diamonds" });
  assert.equal(wrong.moved, false);

  const aceGame = arrangedGame({ waste: ["H1"] });
  const ace = moveCards(aceGame, { type: "waste" }, { type: "foundation", suit: "hearts" });
  assert.equal(ace.moved, true);
  assert.deepEqual(ace.state.foundations.hearts.map(formatCard), ["AH"]);
});

test("auto-foundation moves safe aces as one undoable action", () => {
  const game = arrangedGame({ tableau: [["H1"]], waste: ["C1"] });
  const result = autoMoveToFoundations(game);

  assert.equal(result.moved, true);
  assert.equal(result.state.foundations.hearts.length, 1);
  assert.equal(result.state.foundations.clubs.length, 1);
  assert.equal(result.state.moves, 1);
  assert.equal(result.state.history.length, 1);
});

test("hints prioritize a legal foundation move", () => {
  const game = arrangedGame({ tableau: [["S1"]] });
  const hint = findHint(game);

  assert.deepEqual(hint.source, { type: "tableau", pile: 0, cardIndex: 0 });
  assert.deepEqual(hint.target, { type: "foundation", suit: "spades" });
  assert.match(hint.message, /foundation/i);
});

test("moving the final kings detects a win", () => {
  let game = arrangedGame({
    foundations: { clubs: 12, diamonds: 12, hearts: 12, spades: 12 },
    tableau: [["C13"], ["D13"], ["H13"], ["S13"]]
  });

  for (const [pile, suit] of ["clubs", "diamonds", "hearts", "spades"].entries()) {
    const result = moveCards(game, { type: "tableau", pile, cardIndex: 0 }, { type: "foundation", suit });
    assert.equal(result.moved, true);
    game = result.state;
  }

  assert.equal(game.status, "won");
  assert.equal(validateGame(game), true);
});

test("persistence restores valid games and rejects incompatible data", () => {
  const game = drawStock(createGame(81)).state;
  game.elapsedMs = 12345;
  const restored = deserializeGame(serializeGame(game));

  assert.ok(restored);
  assert.equal(validateGame(restored), true);
  assert.equal(restored.elapsedMs, 12345);
  assert.equal(restored.history.length, 1);
  assert.equal(deserializeGame("not json"), null);
  assert.equal(deserializeGame({ schemaVersion: 2, state: game }), null);
});

test("validation rejects malformed tableau piles without throwing", () => {
  const malformed = createGame(81);
  malformed.tableau[3] = null;

  assert.doesNotThrow(() => validateGame(malformed));
  assert.equal(validateGame(malformed), false);
  assert.equal(deserializeGame(JSON.stringify({ schemaVersion: 1, state: malformed, history: [] })), null);
});
