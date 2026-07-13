import {
  RANK_LABELS,
  SUITS,
  autoMoveToFoundations,
  createGame,
  createWonGame,
  deserializeGame,
  drawStock,
  findHint,
  formatCard,
  moveCards,
  randomSeed,
  serializeGame,
  undoMove
} from "/game.js";

const COLORS = Object.freeze({
  baize: "#176b52",
  rail: "#0b4437",
  porcelain: "#fffdf5",
  oxblood: "#b4233b",
  ink: "#17202a",
  brass: "#d5aa58"
});

const SAVE_KEY = "hosty.solitaire.game.v1";
const STATS_KEY = "hosty.solitaire.stats.v1";
const DEAL_DURATION = 1100;
const HINT_DURATION = 2200;
const SUIT_BY_KEY = new Map(SUITS.map((suit) => [suit.key, suit]));

const app = document.querySelector("#app");
const boardShell = document.querySelector("#board-shell");
const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const statusElement = document.querySelector("#status");
const movesElement = document.querySelector("#moves");
const timeElement = document.querySelector("#time");
const winsElement = document.querySelector("#wins");
const actionButtons = Object.fromEntries([...document.querySelectorAll("[data-action]")].map((button) => [button.dataset.action, button]));

const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches || params.get("motion") === "none";
const forcedSeed = params.has("seed") ? Number(params.get("seed")) : null;
const scenario = params.get("scenario");
const skipSavedGame = params.get("fresh") === "1" || forcedSeed !== null || scenario;

let stats = loadStats();
const restoredGame = skipSavedGame ? null : loadGame();
let game = scenario === "won" ? createWonGame(forcedSeed || 1) : restoredGame || createGame(forcedSeed ?? randomSeed());

if (!restoredGame && scenario !== "won") {
  stats.deals += 1;
  saveStats();
}

const ui = {
  width: 0,
  height: 0,
  selection: null,
  pointer: null,
  drag: null,
  hint: null,
  hintMs: 0,
  message: restoredGame ? "Welcome back. Your table is ready." : scenario === "won" ? "Table cleared." : "A fresh deal is on the table.",
  dealMs: restoredGame || scenario === "won" || reducedMotion ? DEAL_DURATION : 0,
  winMs: scenario === "won" ? 1800 : 0,
  saveMs: 0,
  layout: null
};

function loadGame() {
  try {
    return deserializeGame(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

function saveGame() {
  if (scenario) return;
  try {
    localStorage.setItem(SAVE_KEY, serializeGame(game));
  } catch {
    // Browser storage is optional; gameplay continues in memory.
  }
}

function loadStats() {
  try {
    const value = JSON.parse(localStorage.getItem(STATS_KEY));
    if (value && Number.isInteger(value.deals) && Number.isInteger(value.wins)) {
      return {
        deals: Math.max(0, value.deals),
        wins: Math.max(0, value.wins),
        streak: Math.max(0, Number(value.streak) || 0),
        bestMoves: Number.isInteger(value.bestMoves) ? value.bestMoves : null
      };
    }
  } catch {
    // Ignore malformed or unavailable storage.
  }
  return { deals: 0, wins: 0, streak: 0, bestMoves: null };
}

function saveStats() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Statistics are non-critical.
  }
}

function recordWin() {
  stats.wins += 1;
  stats.streak += 1;
  stats.bestMoves = stats.bestMoves === null ? game.moves : Math.min(stats.bestMoves, game.moves);
  saveStats();
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setMessage(message) {
  ui.message = message;
  statusElement.textContent = message;
}

function updateChrome() {
  movesElement.textContent = String(game.moves);
  timeElement.textContent = formatTime(game.elapsedMs);
  winsElement.textContent = String(stats.wins);
  statusElement.textContent = game.status === "won" ? `Table cleared in ${game.moves} moves · ${formatTime(game.elapsedMs)}` : ui.message;
  actionButtons.undo.disabled = game.history.length === 0;
  actionButtons.hint.disabled = game.status === "won";
  actionButtons.auto.disabled = game.status === "won";
}

function resizeCanvas() {
  const bounds = boardShell.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const dpr = Math.min(devicePixelRatio || 1, 2);

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ui.width = width;
  ui.height = height;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function contains(rect, point) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function calculateLayout() {
  const width = ui.width;
  const height = ui.height;
  const margin = width < 520 ? 7 : Math.max(14, Math.min(34, width * 0.028));
  const gap = width < 520 ? 5 : Math.max(8, Math.min(18, width * 0.014));
  const availableWidth = width - margin * 2 - gap * 6;
  const cardW = Math.max(35, Math.min(118, availableWidth / 7));
  const cardH = cardW * 1.42;
  const topY = Math.max(13, Math.min(24, height * 0.03));
  const boardWidth = cardW * 7 + gap * 6;
  const originX = Math.max(margin, (width - boardWidth) / 2);
  const columnX = Array.from({ length: 7 }, (_, index) => originX + index * (cardW + gap));
  const topGap = Math.max(16, Math.min(28, cardH * 0.2));
  const tableauY = topY + cardH + topGap;
  const bottomPadding = Math.max(12, height * 0.025);
  const tableauAvailable = Math.max(cardH, height - tableauY - bottomPadding);

  const stock = { x: columnX[0], y: topY, w: cardW, h: cardH };
  const waste = { x: columnX[1], y: topY, w: cardW, h: cardH };
  const foundations = Object.fromEntries(SUITS.map((suit, index) => [suit.key, { x: columnX[index + 3], y: topY, w: cardW, h: cardH }]));
  const tableau = game.tableau.map((pile, pileIndex) => {
    const desiredGaps = pile.slice(0, -1).map((card) => card.faceUp ? cardH * 0.27 : cardH * 0.13);
    const desiredHeight = cardH + desiredGaps.reduce((sum, value) => sum + value, 0);
    const compression = desiredHeight > tableauAvailable && desiredGaps.length ? Math.max(0.34, (tableauAvailable - cardH) / (desiredHeight - cardH)) : 1;
    let y = tableauY;
    const cards = pile.map((card, cardIndex) => {
      const rect = { x: columnX[pileIndex], y, w: cardW, h: cardH, cardIndex, card };
      if (cardIndex < pile.length - 1) y += desiredGaps[cardIndex] * compression;
      return rect;
    });
    return {
      pile: pileIndex,
      slot: { x: columnX[pileIndex], y: tableauY, w: cardW, h: cardH },
      zone: { x: columnX[pileIndex] - gap / 2, y: tableauY, w: cardW + gap, h: Math.max(cardH, height - tableauY) },
      cards
    };
  });

  return { width, height, margin: originX, gap, cardW, cardH, topY, tableauY, stock, waste, foundations, tableau };
}

function drawFelt(layout) {
  context.fillStyle = COLORS.baize;
  context.fillRect(0, 0, layout.width, layout.height);

  context.save();
  context.strokeStyle = "rgba(255, 253, 245, 0.035)";
  context.lineWidth = 1;
  for (let y = 7; y < layout.height; y += 18) {
    const offset = (Math.floor(y / 18) % 2) * 9;
    for (let x = offset; x < layout.width; x += 24) {
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 4, y + 1.5);
      context.stroke();
    }
  }
  context.restore();
}

function drawSlot(rect, label, emphasis = false) {
  context.save();
  roundedRectPath(context, rect.x, rect.y, rect.w, rect.h, Math.max(5, rect.w * 0.08));
  context.fillStyle = "rgba(4, 51, 41, 0.28)";
  context.fill();
  context.setLineDash([Math.max(3, rect.w * 0.055), Math.max(3, rect.w * 0.055)]);
  context.strokeStyle = emphasis ? "rgba(213, 170, 88, 0.74)" : "rgba(255, 253, 245, 0.22)";
  context.lineWidth = Math.max(1, rect.w * 0.012);
  context.stroke();
  context.setLineDash([]);
  if (label) {
    context.fillStyle = emphasis ? "rgba(213, 170, 88, 0.78)" : "rgba(255, 253, 245, 0.25)";
    context.font = `${Math.max(15, rect.w * 0.3)}px Baskerville, Georgia, serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
  context.restore();
}

function drawBack(card, rect, options = {}) {
  const radius = Math.max(4, rect.w * 0.075);
  context.save();
  context.shadowColor = options.shadow === false ? "transparent" : "rgba(2, 24, 19, 0.32)";
  context.shadowBlur = options.shadow === false ? 0 : Math.max(4, rect.w * 0.09);
  context.shadowOffsetY = options.shadow === false ? 0 : Math.max(2, rect.w * 0.035);
  roundedRectPath(context, rect.x, rect.y, rect.w, rect.h, radius);
  context.fillStyle = COLORS.porcelain;
  context.fill();
  context.shadowColor = "transparent";
  roundedRectPath(context, rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4, Math.max(3, radius - 1));
  context.fillStyle = COLORS.oxblood;
  context.fill();
  context.strokeStyle = "rgba(255, 253, 245, 0.76)";
  context.lineWidth = Math.max(1, rect.w * 0.018);
  context.stroke();

  const inset = Math.max(5, rect.w * 0.095);
  roundedRectPath(context, rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2, Math.max(2, radius * 0.55));
  context.strokeStyle = "rgba(213, 170, 88, 0.82)";
  context.lineWidth = Math.max(1, rect.w * 0.016);
  context.stroke();
  context.fillStyle = "rgba(255, 253, 245, 0.6)";
  const diamond = Math.max(2.2, rect.w * 0.034);
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const x = rect.x + rect.w * (0.32 + column * 0.18) + (row % 2 ? rect.w * 0.05 : 0);
      const y = rect.y + rect.h * (0.25 + row * 0.125);
      context.save();
      context.translate(x, y);
      context.rotate(Math.PI / 4);
      context.fillRect(-diamond / 2, -diamond / 2, diamond, diamond);
      context.restore();
    }
  }
  context.restore();
}

function drawFace(card, rect, options = {}) {
  const radius = Math.max(4, rect.w * 0.075);
  const suit = SUIT_BY_KEY.get(card.suit);
  const color = suit.color === "red" ? COLORS.oxblood : COLORS.ink;
  context.save();
  context.shadowColor = options.shadow === false ? "transparent" : "rgba(2, 24, 19, 0.3)";
  context.shadowBlur = options.shadow === false ? 0 : Math.max(4, rect.w * 0.09);
  context.shadowOffsetY = options.shadow === false ? 0 : Math.max(2, rect.w * 0.035);
  roundedRectPath(context, rect.x, rect.y, rect.w, rect.h, radius);
  context.fillStyle = COLORS.porcelain;
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "rgba(23, 32, 42, 0.2)";
  context.lineWidth = Math.max(0.8, rect.w * 0.01);
  context.stroke();

  const compact = rect.w < 48;
  context.fillStyle = color;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = `700 ${Math.max(10, rect.w * (compact ? 0.24 : 0.22))}px "Avenir Next", "Segoe UI", sans-serif`;
  context.fillText(RANK_LABELS[card.rank], rect.x + rect.w * 0.1, rect.y + rect.h * 0.06);
  context.font = `${Math.max(10, rect.w * (compact ? 0.25 : 0.23))}px Georgia, serif`;
  context.fillText(suit.symbol, rect.x + rect.w * 0.1, rect.y + rect.h * 0.24);

  if (!compact) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.globalAlpha = card.rank > 10 ? 0.92 : 0.78;
    context.font = `${Math.max(19, rect.w * 0.46)}px Baskerville, Georgia, serif`;
    context.fillText(suit.symbol, rect.x + rect.w * 0.57, rect.y + rect.h * 0.6);
  }
  context.restore();
}

function drawCard(card, rect, options = {}) {
  if (card.faceUp) drawFace(card, rect, options);
  else drawBack(card, rect, options);
}

function drawOutline(rect, color = COLORS.brass, width = 3) {
  context.save();
  roundedRectPath(context, rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, Math.max(6, rect.w * 0.09));
  context.strokeStyle = color;
  context.lineWidth = width;
  context.shadowColor = color;
  context.shadowBlur = 8;
  context.stroke();
  context.restore();
}

function sourceKey(source) {
  if (!source) return "";
  if (source.type === "tableau") return `tableau:${source.pile}:${source.cardIndex}`;
  if (source.type === "foundation") return `foundation:${source.suit}`;
  return source.type;
}

function sourceCards(source) {
  if (!source) return [];
  if (source.type === "waste") return game.waste.length ? [game.waste.at(-1)] : [];
  if (source.type === "foundation") {
    const card = game.foundations[source.suit]?.at(-1);
    return card ? [card] : [];
  }
  if (source.type === "tableau") return game.tableau[source.pile]?.slice(source.cardIndex) || [];
  return [];
}

function isDragged(source) {
  return ui.drag && sourceKey(ui.drag.source) === sourceKey(source);
}

function dealOrder() {
  const order = new Map();
  let index = 0;
  for (let row = 0; row < 7; row += 1) {
    for (let pile = row; pile < 7; pile += 1) {
      const card = game.tableau[pile][row];
      if (card) order.set(card.id, index++);
    }
  }
  return order;
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function renderTableau(layout) {
  const order = dealOrder();
  for (const pileLayout of layout.tableau) {
    if (pileLayout.cards.length === 0) drawSlot(pileLayout.slot, "K");
    for (const cardRect of pileLayout.cards) {
      const source = { type: "tableau", pile: pileLayout.pile, cardIndex: cardRect.cardIndex };
      if (ui.drag && ui.drag.source.type === "tableau" && ui.drag.source.pile === pileLayout.pile && cardRect.cardIndex >= ui.drag.source.cardIndex) continue;

      const index = order.get(cardRect.card.id) ?? 0;
      const progress = reducedMotion ? 1 : smoothstep((ui.dealMs - index * 24) / 330);
      if (progress <= 0) continue;
      const travel = 1 - progress;
      const rect = {
        x: layout.stock.x + (cardRect.x - layout.stock.x) * progress,
        y: layout.stock.y + (cardRect.y - layout.stock.y) * progress - Math.sin(progress * Math.PI) * layout.cardH * 0.14,
        w: cardRect.w,
        h: cardRect.h
      };
      context.save();
      context.globalAlpha = 0.55 + progress * 0.45;
      drawCard(cardRect.card, rect, { shadow: travel < 0.98 });
      context.restore();
    }
  }
}

function renderTopRow(layout) {
  drawSlot(layout.stock, game.stock.length ? "" : game.waste.length ? "↻" : "");
  if (game.stock.length) drawBack(game.stock.at(-1), layout.stock);

  drawSlot(layout.waste, "");
  if (game.waste.length && !isDragged({ type: "waste" })) drawFace(game.waste.at(-1), layout.waste);

  for (const suit of SUITS) {
    const rect = layout.foundations[suit.key];
    drawSlot(rect, suit.symbol, true);
    const card = game.foundations[suit.key].at(-1);
    if (card && !isDragged({ type: "foundation", suit: suit.key })) drawFace(card, rect);
  }
}

function rectForSource(source, layout = ui.layout) {
  if (!source || !layout) return null;
  if (source.type === "stock") return layout.stock;
  if (source.type === "waste") return layout.waste;
  if (source.type === "foundation") return layout.foundations[source.suit];
  if (source.type === "tableau") return layout.tableau[source.pile]?.cards[source.cardIndex] || layout.tableau[source.pile]?.slot;
  return null;
}

function rectForTarget(target, layout = ui.layout) {
  if (!target || !layout) return null;
  if (target.type === "foundation") return layout.foundations[target.suit];
  if (target.type === "tableau") return layout.tableau[target.pile]?.cards.at(-1) || layout.tableau[target.pile]?.slot;
  return null;
}

function renderHighlights(layout) {
  if (ui.selection) {
    const rect = rectForSource(ui.selection, layout);
    if (rect) drawOutline(rect, COLORS.porcelain, Math.max(2, layout.cardW * 0.025));
  }
  if (ui.hint && ui.hintMs > 0) {
    const sourceRect = rectForSource(ui.hint.source, layout);
    const targetRect = rectForTarget(ui.hint.target, layout);
    if (sourceRect) drawOutline(sourceRect, COLORS.brass, Math.max(2.5, layout.cardW * 0.03));
    if (targetRect) drawOutline(targetRect, COLORS.brass, Math.max(2.5, layout.cardW * 0.03));
  }
}

function renderDraggedCards(layout) {
  if (!ui.drag) return;
  const cards = sourceCards(ui.drag.source);
  if (!cards.length) return;
  const x = ui.drag.x - layout.cardW * 0.5;
  let y = ui.drag.y - layout.cardH * 0.18;
  for (const card of cards) {
    drawCard(card, { x, y, w: layout.cardW, h: layout.cardH });
    y += layout.cardH * 0.27;
  }
}

function renderWin(layout) {
  if (game.status !== "won") return;
  if (!reducedMotion) {
    for (let index = 0; index < 34; index += 1) {
      const phase = (ui.winMs * 0.00012 * (1 + (index % 5) * 0.08) + index * 0.137) % 1;
      const x = ((index * 79) % 101) / 100 * layout.width;
      const y = -20 + phase * (layout.height + 50);
      const size = 3 + (index % 4) * 1.5;
      context.save();
      context.translate(x + Math.sin(ui.winMs * 0.001 + index) * 18, y);
      context.rotate(phase * Math.PI * 4 + index);
      context.fillStyle = [COLORS.brass, COLORS.porcelain, COLORS.oxblood][index % 3];
      context.globalAlpha = 0.78;
      context.fillRect(-size, -size * 0.35, size * 2, size * 0.7);
      context.restore();
    }
  }

  const panelW = Math.min(layout.width - 28, 470);
  const panelH = Math.min(150, layout.height * 0.3);
  const panel = { x: (layout.width - panelW) / 2, y: Math.max(18, (layout.height - panelH) / 2), w: panelW, h: panelH };
  context.save();
  roundedRectPath(context, panel.x, panel.y, panel.w, panel.h, 12);
  context.fillStyle = "rgba(7, 54, 45, 0.93)";
  context.fill();
  context.strokeStyle = "rgba(213, 170, 88, 0.85)";
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = COLORS.brass;
  context.font = `700 ${Math.max(9, Math.min(12, panelW * 0.026))}px "Avenir Next", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("THE TABLE IS CLEAR", panel.x + panel.w / 2, panel.y + panel.h * 0.28);
  context.fillStyle = COLORS.porcelain;
  context.font = `600 ${Math.max(25, Math.min(39, panelW * 0.085))}px Baskerville, Georgia, serif`;
  context.fillText("A lovely finish.", panel.x + panel.w / 2, panel.y + panel.h * 0.55);
  context.fillStyle = "rgba(255, 253, 245, 0.74)";
  context.font = `${Math.max(10, Math.min(13, panelW * 0.029))}px ui-monospace, monospace`;
  context.fillText(`${game.moves} moves  ·  ${formatTime(game.elapsedMs)}  ·  press N for a new deal`, panel.x + panel.w / 2, panel.y + panel.h * 0.78);
  context.restore();
}

function render() {
  if (!ui.width || !ui.height) return;
  context.clearRect(0, 0, ui.width, ui.height);
  const layout = calculateLayout();
  ui.layout = layout;
  drawFelt(layout);
  renderTopRow(layout);
  renderTableau(layout);
  renderHighlights(layout);
  renderDraggedCards(layout);
  renderWin(layout);
  updateChrome();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hitTest(point) {
  const layout = ui.layout;
  if (!layout) return null;
  if (contains(layout.stock, point)) return { kind: "stock" };
  if (contains(layout.waste, point)) return { kind: "waste" };
  for (const suit of SUITS) {
    if (contains(layout.foundations[suit.key], point)) return { kind: "foundation", suit: suit.key };
  }

  for (const pileLayout of layout.tableau) {
    for (let index = pileLayout.cards.length - 1; index >= 0; index -= 1) {
      if (contains(pileLayout.cards[index], point)) return { kind: "tableau", pile: pileLayout.pile, cardIndex: index };
    }
    if (contains(pileLayout.zone, point)) {
      return { kind: "tableau", pile: pileLayout.pile, cardIndex: Math.max(0, pileLayout.cards.length - 1) };
    }
  }
  return null;
}

function sourceFromHit(hit) {
  if (!hit) return null;
  if (hit.kind === "waste" && game.waste.length) return { type: "waste" };
  if (hit.kind === "foundation" && game.foundations[hit.suit].length) return { type: "foundation", suit: hit.suit };
  if (hit.kind === "tableau") {
    const card = game.tableau[hit.pile]?.[hit.cardIndex];
    if (card?.faceUp) return { type: "tableau", pile: hit.pile, cardIndex: hit.cardIndex };
  }
  return null;
}

function targetFromHit(hit) {
  if (!hit) return null;
  if (hit.kind === "foundation") return { type: "foundation", suit: hit.suit };
  if (hit.kind === "tableau") return { type: "tableau", pile: hit.pile };
  return null;
}

function describeSource(source) {
  const card = sourceCards(source)[0];
  return card ? `${formatCard(card)} selected` : "Card selected";
}

function applyResult(result, successMessage = null) {
  if (!result.moved) {
    setMessage(result.error || "That move is not available.");
    render();
    return false;
  }
  const previousStatus = game.status;
  game = result.state;
  ui.selection = null;
  ui.hint = null;
  ui.hintMs = 0;
  setMessage(successMessage || game.lastAction || "Move made.");
  if (previousStatus !== "won" && game.status === "won") {
    recordWin();
    ui.winMs = 0;
  }
  saveGame();
  render();
  return true;
}

function handleTap(hit) {
  if (ui.dealMs < DEAL_DURATION) {
    setMessage("Let the deal settle.");
    return;
  }
  if (game.status === "won") {
    setMessage("Press New deal to play again.");
    return;
  }
  if (hit?.kind === "stock") {
    ui.selection = null;
    applyResult(drawStock(game));
    return;
  }

  const clickedSource = sourceFromHit(hit);
  if (!ui.selection) {
    if (clickedSource) {
      ui.selection = clickedSource;
      setMessage(describeSource(clickedSource));
      render();
    }
    return;
  }

  if (clickedSource && sourceKey(clickedSource) === sourceKey(ui.selection)) {
    ui.selection = null;
    setMessage("Selection cleared.");
    render();
    return;
  }

  const target = targetFromHit(hit);
  if (target && applyResult(moveCards(game, ui.selection, target))) return;

  if (clickedSource) {
    ui.selection = clickedSource;
    setMessage(describeSource(clickedSource));
    render();
  }
}

function newDeal(seed = randomSeed()) {
  game = createGame(seed);
  stats.deals += 1;
  stats.streak = 0;
  saveStats();
  ui.selection = null;
  ui.drag = null;
  ui.hint = null;
  ui.hintMs = 0;
  ui.dealMs = reducedMotion ? DEAL_DURATION : 0;
  ui.winMs = 0;
  setMessage("A fresh deal is on the table.");
  saveGame();
  render();
}

function showHint() {
  if (game.status === "won") return;
  const nextHint = findHint(game);
  ui.hint = nextHint;
  ui.hintMs = nextHint ? HINT_DURATION : 0;
  setMessage(nextHint?.message || "No legal move is available.");
  render();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await app.requestFullscreen();
  } catch {
    setMessage("Fullscreen is not available in this window.");
  }
}

function runAction(action) {
  if (action === "new") newDeal();
  else if (action === "undo") applyResult(undoMove(game));
  else if (action === "hint") showHint();
  else if (action === "auto") applyResult(autoMoveToFoundations(game));
  else if (action === "fullscreen") toggleFullscreen();
}

for (const button of Object.values(actionButtons)) {
  button.addEventListener("click", () => runAction(button.dataset.action));
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || ui.dealMs < DEAL_DURATION || game.status === "won") return;
  const point = canvasPoint(event);
  const hit = hitTest(point);
  ui.pointer = { id: event.pointerId, start: point, point, hit, source: sourceFromHit(hit) };
  canvas.setPointerCapture(event.pointerId);
  canvas.focus({ preventScroll: true });
});

canvas.addEventListener("pointermove", (event) => {
  if (!ui.pointer || ui.pointer.id !== event.pointerId) return;
  const point = canvasPoint(event);
  ui.pointer.point = point;
  const distance = Math.hypot(point.x - ui.pointer.start.x, point.y - ui.pointer.start.y);
  if (!ui.drag && ui.pointer.source && distance > 7) {
    ui.drag = { source: ui.pointer.source, x: point.x, y: point.y };
    ui.selection = null;
    canvas.classList.add("is-dragging");
  }
  if (ui.drag) {
    ui.drag.x = point.x;
    ui.drag.y = point.y;
    render();
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (!ui.pointer || ui.pointer.id !== event.pointerId) return;
  const point = canvasPoint(event);
  if (ui.drag) {
    const source = ui.drag.source;
    const target = targetFromHit(hitTest(point));
    ui.drag = null;
    canvas.classList.remove("is-dragging");
    if (target) applyResult(moveCards(game, source, target));
    else {
      setMessage("Card returned to its pile.");
      render();
    }
  } else {
    handleTap(hitTest(point));
  }
  ui.pointer = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointercancel", (event) => {
  ui.pointer = null;
  ui.drag = null;
  canvas.classList.remove("is-dragging");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  render();
});

canvas.addEventListener("dblclick", (event) => {
  if (ui.dealMs < DEAL_DURATION || game.status === "won") return;
  const source = sourceFromHit(hitTest(canvasPoint(event)));
  const card = sourceCards(source)[0];
  if (!source || !card) return;
  ui.selection = null;
  applyResult(moveCards(game, source, { type: "foundation", suit: card.suit }));
});

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  const action = { n: "new", z: "undo", h: "hint", a: "auto", f: "fullscreen" }[key];
  if (!action) return;
  event.preventDefault();
  runAction(action);
});

document.addEventListener("fullscreenchange", resizeCanvas);
new ResizeObserver(resizeCanvas).observe(boardShell);

function update(deltaMs) {
  const delta = Math.max(0, Math.min(deltaMs, 100));
  if (game.status === "playing" && ui.dealMs >= DEAL_DURATION && !document.hidden) {
    game.elapsedMs += delta;
  }
  ui.dealMs = Math.min(DEAL_DURATION, ui.dealMs + delta);
  if (ui.hintMs > 0) {
    ui.hintMs = Math.max(0, ui.hintMs - delta);
    if (ui.hintMs === 0) ui.hint = null;
  }
  if (game.status === "won") ui.winMs += delta;
  ui.saveMs += delta;
  if (ui.saveMs >= 5000) {
    ui.saveMs = 0;
    saveGame();
  }
}

let previousFrame = performance.now();
function frame(timestamp) {
  const wasAnimating = ui.dealMs < DEAL_DURATION || ui.hintMs > 0 || (game.status === "won" && !reducedMotion);
  update(timestamp - previousFrame);
  previousFrame = timestamp;
  const isAnimating = ui.dealMs < DEAL_DURATION || ui.hintMs > 0 || (game.status === "won" && !reducedMotion);
  if (wasAnimating || isAnimating) render();
  else updateChrome();
  requestAnimationFrame(frame);
}

window.advanceTime = (milliseconds) => {
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  const step = milliseconds / steps;
  for (let index = 0; index < steps; index += 1) update(step);
  render();
};

window.render_game_to_text = () => {
  const layout = ui.layout || calculateLayout();
  const rectSummary = (rect) => rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) } : null;
  return JSON.stringify({
    game: "draw-one Klondike",
    status: game.status,
    coordinateSystem: "CSS pixels; origin is canvas top-left; x increases right, y increases down",
    canvas: { width: layout.width, height: layout.height },
    seed: game.seed,
    moves: game.moves,
    elapsedSeconds: Math.floor(game.elapsedMs / 1000),
    redeals: game.redeals,
    stock: { count: game.stock.length, action: game.stock.length ? "draw" : game.waste.length ? "recycle" : "empty", rect: rectSummary(layout.stock) },
    waste: { count: game.waste.length, top: formatCard(game.waste.at(-1)), rect: rectSummary(layout.waste) },
    foundations: Object.fromEntries(SUITS.map((suit) => [suit.key, { count: game.foundations[suit.key].length, top: formatCard(game.foundations[suit.key].at(-1)), rect: rectSummary(layout.foundations[suit.key]) }])),
    tableau: layout.tableau.map((pileLayout) => ({
      pile: pileLayout.pile,
      cards: pileLayout.cards.map((entry) => ({ card: entry.card.faceUp ? formatCard(entry.card) : "XX", faceUp: entry.card.faceUp, cardIndex: entry.cardIndex, rect: rectSummary(entry) })),
      emptyRect: pileLayout.cards.length ? null : rectSummary(pileLayout.slot)
    })),
    selection: ui.selection,
    hint: ui.hint,
    animation: ui.dealMs < DEAL_DURATION ? "dealing" : game.status === "won" ? "won" : "idle",
    availableActions: {
      newDeal: true,
      undo: game.history.length > 0,
      hint: game.status === "playing",
      autoFoundation: game.status === "playing",
      fullscreen: true
    },
    message: game.status === "won" ? `Table cleared in ${game.moves} moves` : ui.message
  });
};

updateChrome();
resizeCanvas();
requestAnimationFrame(frame);
