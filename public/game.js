export const GAME_SCHEMA_VERSION = 1;
export const MAX_UNDO = 80;

export const SUITS = Object.freeze([
  Object.freeze({ key: "clubs", short: "C", symbol: "♣", color: "black" }),
  Object.freeze({ key: "diamonds", short: "D", symbol: "♦", color: "red" }),
  Object.freeze({ key: "hearts", short: "H", symbol: "♥", color: "red" }),
  Object.freeze({ key: "spades", short: "S", symbol: "♠", color: "black" })
]);

export const RANK_LABELS = Object.freeze([null, "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);

const SUIT_BY_KEY = new Map(SUITS.map((suit) => [suit.key, suit]));

export function normalizeSeed(value) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return number >>> 0;
  }
  return 1;
}

export function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export function makeCard(suit, rank, faceUp = false) {
  const definition = SUIT_BY_KEY.get(suit);
  if (!definition || !Number.isInteger(rank) || rank < 1 || rank > 13) {
    throw new TypeError("Invalid card");
  }
  return { id: `${definition.short}${rank}`, suit, rank, faceUp: Boolean(faceUp) };
}

export function createDeck() {
  return SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, index) => makeCard(suit.key, index + 1)));
}

function mulberry32(seed) {
  let value = normalizeSeed(seed);
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeck(deck, seed) {
  const random = mulberry32(seed);
  const shuffled = deck.map(cloneCard);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function cloneCard(card) {
  return { id: card.id, suit: card.suit, rank: card.rank, faceUp: Boolean(card.faceUp) };
}

function clonePiles(piles) {
  return piles.map((pile) => pile.map(cloneCard));
}

export function snapshotGame(state) {
  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    seed: normalizeSeed(state.seed),
    status: state.status,
    stock: state.stock.map(cloneCard),
    waste: state.waste.map(cloneCard),
    foundations: Object.fromEntries(SUITS.map((suit) => [suit.key, (state.foundations[suit.key] || []).map(cloneCard)])),
    tableau: clonePiles(state.tableau),
    moves: Number.isInteger(state.moves) ? state.moves : 0,
    redeals: Number.isInteger(state.redeals) ? state.redeals : 0,
    elapsedMs: Number.isFinite(state.elapsedMs) ? Math.max(0, state.elapsedMs) : 0,
    lastAction: typeof state.lastAction === "string" ? state.lastAction : ""
  };
}

function hydrateGame(snapshot, history = []) {
  const state = snapshotGame(snapshot);
  state.history = history;
  return state;
}

export function createGame(seed = randomSeed()) {
  const normalizedSeed = normalizeSeed(seed);
  const deck = shuffleDeck(createDeck(), normalizedSeed);
  const tableau = Array.from({ length: 7 }, () => []);

  for (let column = 0; column < 7; column += 1) {
    for (let row = 0; row <= column; row += 1) {
      const card = deck.pop();
      card.faceUp = row === column;
      tableau[column].push(card);
    }
  }

  for (const card of deck) {
    card.faceUp = false;
  }

  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    seed: normalizedSeed,
    status: "playing",
    stock: deck,
    waste: [],
    foundations: Object.fromEntries(SUITS.map((suit) => [suit.key, []])),
    tableau,
    moves: 0,
    redeals: 0,
    elapsedMs: 0,
    lastAction: "New deal",
    history: []
  };
}

export function createWonGame(seed = 1) {
  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    seed: normalizeSeed(seed),
    status: "won",
    stock: [],
    waste: [],
    foundations: Object.fromEntries(SUITS.map((suit) => [suit.key, Array.from({ length: 13 }, (_, index) => makeCard(suit.key, index + 1, true))])),
    tableau: Array.from({ length: 7 }, () => []),
    moves: 112,
    redeals: 1,
    elapsedMs: 420000,
    lastAction: "Game won",
    history: []
  };
}

export function cardColor(card) {
  return SUIT_BY_KEY.get(card?.suit)?.color;
}

export function formatCard(card) {
  if (!card) return null;
  const suit = SUIT_BY_KEY.get(card.suit);
  return `${RANK_LABELS[card.rank]}${suit?.short || "?"}`;
}

export function isValidTableauRun(cards, startIndex = 0) {
  if (!Array.isArray(cards) || startIndex < 0 || startIndex >= cards.length) return false;
  for (let index = startIndex; index < cards.length; index += 1) {
    const card = cards[index];
    if (!card.faceUp) return false;
    if (index > startIndex) {
      const previous = cards[index - 1];
      if (previous.rank !== card.rank + 1 || cardColor(previous) === cardColor(card)) return false;
    }
  }
  return true;
}

export function canPlaceOnTableau(card, targetPile) {
  if (!card?.faceUp || !Array.isArray(targetPile)) return false;
  if (targetPile.length === 0) return card.rank === 13;
  const target = targetPile.at(-1);
  return target.faceUp && target.rank === card.rank + 1 && cardColor(target) !== cardColor(card);
}

export function canPlaceOnFoundation(card, foundation, suitKey) {
  if (!card?.faceUp || card.suit !== suitKey || !Array.isArray(foundation)) return false;
  return card.rank === foundation.length + 1;
}

function transact(state, actionName, mutate) {
  const next = hydrateGame(snapshotGame(state), state.history.slice());
  const result = mutate(next);
  if (result !== true) {
    return { state, moved: false, error: typeof result === "string" ? result : "Move not allowed" };
  }

  next.history = [...state.history, snapshotGame(state)].slice(-MAX_UNDO);
  next.moves = state.moves + 1;
  next.lastAction = actionName;
  next.status = isGameWon(next) ? "won" : "playing";
  return { state: next, moved: true, error: null };
}

function sourceCards(state, source) {
  if (source?.type === "waste") {
    const card = state.waste.at(-1);
    return card ? [card] : null;
  }
  if (source?.type === "foundation") {
    const pile = state.foundations[source.suit];
    const card = pile?.at(-1);
    return card ? [card] : null;
  }
  if (source?.type === "tableau") {
    const pile = state.tableau[source.pile];
    const index = source.cardIndex;
    if (!pile || !Number.isInteger(index) || !isValidTableauRun(pile, index)) return null;
    return pile.slice(index);
  }
  return null;
}

function removeSource(state, source, count) {
  if (source.type === "waste") {
    state.waste.pop();
    return;
  }
  if (source.type === "foundation") {
    state.foundations[source.suit].pop();
    return;
  }
  const pile = state.tableau[source.pile];
  pile.splice(source.cardIndex, count);
  const exposed = pile.at(-1);
  if (exposed && !exposed.faceUp) exposed.faceUp = true;
}

export function moveCards(state, source, target) {
  return transact(state, "Move card", (next) => {
    const cards = sourceCards(next, source);
    if (!cards?.length) return "Select a face-up card";

    if (target?.type === "tableau") {
      const targetPile = next.tableau[target.pile];
      if (!targetPile || (source.type === "tableau" && source.pile === target.pile)) return "Choose another pile";
      if (!canPlaceOnTableau(cards[0], targetPile)) return "Build down in alternating colors";
      removeSource(next, source, cards.length);
      targetPile.push(...cards);
      return true;
    }

    if (target?.type === "foundation") {
      if (cards.length !== 1) return "Only one card can move to a foundation";
      const foundation = next.foundations[target.suit];
      if (!foundation || !canPlaceOnFoundation(cards[0], foundation, target.suit)) return "Build foundations by suit from ace to king";
      removeSource(next, source, 1);
      foundation.push(cards[0]);
      return true;
    }

    return "Choose a tableau or foundation pile";
  });
}

export function drawStock(state) {
  return transact(state, state.stock.length > 0 ? "Draw card" : "Recycle stock", (next) => {
    if (next.stock.length > 0) {
      const card = next.stock.pop();
      card.faceUp = true;
      next.waste.push(card);
      return true;
    }
    if (next.waste.length === 0) return "The stock is empty";
    next.stock = next.waste.reverse().map((card) => ({ ...card, faceUp: false }));
    next.waste = [];
    next.redeals += 1;
    return true;
  });
}

export function undoMove(state) {
  if (!state.history.length) {
    return { state, moved: false, error: "Nothing to undo" };
  }
  const history = state.history.slice(0, -1);
  const previous = state.history.at(-1);
  const restored = hydrateGame(previous, history);
  restored.lastAction = "Undo";
  return { state: restored, moved: true, error: null };
}

function foundationRank(state, suitKey) {
  return state.foundations[suitKey].length;
}

export function isSafeForFoundation(state, card) {
  if (!card) return false;
  if (card.rank <= 2) return true;
  const color = cardColor(card);
  return SUITS.filter((suit) => suit.color !== color).every((suit) => foundationRank(state, suit.key) >= card.rank - 1);
}

export function autoMoveToFoundations(state) {
  return transact(state, "Auto-finish", (next) => {
    let movedAny = false;
    let movedThisPass = true;

    while (movedThisPass) {
      movedThisPass = false;
      const wasteCard = next.waste.at(-1);
      if (wasteCard && isSafeForFoundation(next, wasteCard) && canPlaceOnFoundation(wasteCard, next.foundations[wasteCard.suit], wasteCard.suit)) {
        next.waste.pop();
        next.foundations[wasteCard.suit].push(wasteCard);
        movedAny = true;
        movedThisPass = true;
        continue;
      }

      for (const pile of next.tableau) {
        const card = pile.at(-1);
        if (!card || !isSafeForFoundation(next, card) || !canPlaceOnFoundation(card, next.foundations[card.suit], card.suit)) continue;
        pile.pop();
        next.foundations[card.suit].push(card);
        const exposed = pile.at(-1);
        if (exposed && !exposed.faceUp) exposed.faceUp = true;
        movedAny = true;
        movedThisPass = true;
        break;
      }
    }

    return movedAny ? true : "No safe foundation moves";
  });
}

function hint(source, target, message) {
  return { source, target, message };
}

export function findHint(state) {
  for (let pileIndex = 0; pileIndex < state.tableau.length; pileIndex += 1) {
    const pile = state.tableau[pileIndex];
    const card = pile.at(-1);
    if (card && canPlaceOnFoundation(card, state.foundations[card.suit], card.suit)) {
      return hint({ type: "tableau", pile: pileIndex, cardIndex: pile.length - 1 }, { type: "foundation", suit: card.suit }, `Move ${formatCard(card)} to its foundation`);
    }
  }

  const wasteCard = state.waste.at(-1);
  if (wasteCard && canPlaceOnFoundation(wasteCard, state.foundations[wasteCard.suit], wasteCard.suit)) {
    return hint({ type: "waste" }, { type: "foundation", suit: wasteCard.suit }, `Move ${formatCard(wasteCard)} to its foundation`);
  }

  for (let sourcePile = 0; sourcePile < state.tableau.length; sourcePile += 1) {
    const pile = state.tableau[sourcePile];
    for (let cardIndex = 0; cardIndex < pile.length; cardIndex += 1) {
      if (!isValidTableauRun(pile, cardIndex)) continue;
      for (let targetPile = 0; targetPile < state.tableau.length; targetPile += 1) {
        if (sourcePile === targetPile || !canPlaceOnTableau(pile[cardIndex], state.tableau[targetPile])) continue;
        const revealsCard = cardIndex > 0 && !pile[cardIndex - 1].faceUp;
        if (revealsCard) {
          return hint({ type: "tableau", pile: sourcePile, cardIndex }, { type: "tableau", pile: targetPile }, `Move ${formatCard(pile[cardIndex])} to reveal a card`);
        }
      }
    }
  }

  if (wasteCard) {
    for (let targetPile = 0; targetPile < state.tableau.length; targetPile += 1) {
      if (canPlaceOnTableau(wasteCard, state.tableau[targetPile])) {
        return hint({ type: "waste" }, { type: "tableau", pile: targetPile }, `Move ${formatCard(wasteCard)} to tableau ${targetPile + 1}`);
      }
    }
  }

  for (let sourcePile = 0; sourcePile < state.tableau.length; sourcePile += 1) {
    const pile = state.tableau[sourcePile];
    for (let cardIndex = 0; cardIndex < pile.length; cardIndex += 1) {
      if (!isValidTableauRun(pile, cardIndex)) continue;
      for (let targetPile = 0; targetPile < state.tableau.length; targetPile += 1) {
        if (sourcePile !== targetPile && canPlaceOnTableau(pile[cardIndex], state.tableau[targetPile])) {
          return hint({ type: "tableau", pile: sourcePile, cardIndex }, { type: "tableau", pile: targetPile }, `Move ${formatCard(pile[cardIndex])} to tableau ${targetPile + 1}`);
        }
      }
    }
  }

  if (state.stock.length || state.waste.length) {
    return hint({ type: "stock" }, null, state.stock.length ? "Draw from the stock" : "Recycle the waste into the stock");
  }

  return null;
}

export function isGameWon(state) {
  return SUITS.every((suit) => state.foundations[suit.key]?.length === 13);
}

function validateCard(card) {
  if (!card || typeof card !== "object") return false;
  const suit = SUIT_BY_KEY.get(card.suit);
  return Boolean(suit) && Number.isInteger(card.rank) && card.rank >= 1 && card.rank <= 13 && card.id === `${suit.short}${card.rank}` && typeof card.faceUp === "boolean";
}

export function validateGame(state) {
  if (!state || state.schemaVersion !== GAME_SCHEMA_VERSION || !Array.isArray(state.stock) || !Array.isArray(state.waste) || !Array.isArray(state.tableau) || state.tableau.length !== 7) return false;
  if (!state.foundations || !SUITS.every((suit) => Array.isArray(state.foundations[suit.key]))) return false;
  if (!Number.isInteger(state.moves) || state.moves < 0 || !Number.isInteger(state.redeals) || state.redeals < 0 || !Number.isFinite(state.elapsedMs) || state.elapsedMs < 0) return false;
  if (state.status !== "playing" && state.status !== "won") return false;

  const allCards = [...state.stock, ...state.waste, ...state.tableau.flat(), ...SUITS.flatMap((suit) => state.foundations[suit.key])];
  if (allCards.length !== 52 || allCards.some((card) => !validateCard(card)) || new Set(allCards.map((card) => card.id)).size !== 52) return false;
  if (state.stock.some((card) => card.faceUp) || state.waste.some((card) => !card.faceUp)) return false;

  for (const suit of SUITS) {
    const foundation = state.foundations[suit.key];
    if (foundation.some((card, index) => !card.faceUp || card.suit !== suit.key || card.rank !== index + 1)) return false;
  }

  for (const pile of state.tableau) {
    let foundFaceUp = false;
    for (const card of pile) {
      if (card.faceUp) foundFaceUp = true;
      else if (foundFaceUp) return false;
    }
    const firstFaceUp = pile.findIndex((card) => card.faceUp);
    if (firstFaceUp >= 0 && !isValidTableauRun(pile, firstFaceUp)) return false;
    if (pile.length && !pile.at(-1).faceUp) return false;
  }

  return state.status === (isGameWon(state) ? "won" : "playing");
}

export function serializeGame(state) {
  return JSON.stringify({
    schemaVersion: GAME_SCHEMA_VERSION,
    state: snapshotGame(state),
    history: state.history.slice(-MAX_UNDO).map(snapshotGame)
  });
}

export function deserializeGame(value) {
  try {
    const payload = typeof value === "string" ? JSON.parse(value) : value;
    if (!payload || payload.schemaVersion !== GAME_SCHEMA_VERSION || !validateGame(payload.state)) return null;
    const history = Array.isArray(payload.history) ? payload.history.filter(validateGame).slice(-MAX_UNDO).map(snapshotGame) : [];
    return hydrateGame(payload.state, history);
  } catch {
    return null;
  }
}
