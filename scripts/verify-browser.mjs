import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173";
const output = fileURLToPath(new URL("../test-results/browser-smoke/", import.meta.url));
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

function watch(page) {
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
}

async function readState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

function center(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + Math.min(rect.h * 0.42, 54) };
}

const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
watch(desktop);
await desktop.goto(`${baseUrl}/?seed=42&fresh=1&motion=none`, { waitUntil: "networkidle" });

let state = await readState(desktop);
assert.equal(state.seed, 42);
assert.equal(state.tableau[5].cards.at(-1).card, "AH");

const canvasBox = await desktop.locator("#game-canvas").boundingBox();
assert.ok(canvasBox);
const ace = center(state.tableau[5].cards.at(-1).rect);
const hearts = center(state.foundations.hearts.rect);
await desktop.mouse.move(canvasBox.x + ace.x, canvasBox.y + ace.y);
await desktop.mouse.down();
await desktop.mouse.move(canvasBox.x + hearts.x, canvasBox.y + hearts.y, { steps: 8 });
await desktop.mouse.up();

state = await readState(desktop);
assert.equal(state.foundations.hearts.top, "AH");
assert.equal(state.tableau[5].cards.at(-1).card, "3D");
assert.equal(state.moves, 1);

await desktop.click('[data-action="undo"]');
state = await readState(desktop);
assert.equal(state.foundations.hearts.count, 0);
assert.equal(state.tableau[5].cards.at(-1).card, "AH");
assert.equal(state.moves, 0);

await desktop.mouse.click(canvasBox.x + ace.x, canvasBox.y + ace.y);
await desktop.mouse.click(canvasBox.x + hearts.x, canvasBox.y + hearts.y);
state = await readState(desktop);
assert.equal(state.foundations.hearts.top, "AH");
await desktop.click('[data-action="undo"]');

await desktop.mouse.dblclick(canvasBox.x + ace.x, canvasBox.y + ace.y);
state = await readState(desktop);
assert.equal(state.foundations.hearts.top, "AH");
await desktop.click('[data-action="undo"]');

await desktop.keyboard.press("a");
state = await readState(desktop);
assert.equal(state.foundations.hearts.top, "AH");
await desktop.click('[data-action="undo"]');

const stock = center(state.stock.rect);
await desktop.mouse.click(canvasBox.x + stock.x, canvasBox.y + stock.y);
state = await readState(desktop);
assert.equal(state.stock.count, 23);
assert.equal(state.waste.count, 1);

await desktop.goto(`${baseUrl}/?motion=none`, { waitUntil: "networkidle" });
state = await readState(desktop);
assert.equal(state.seed, 42);
assert.equal(state.stock.count, 23);
assert.equal(state.moves, 1);

await desktop.goto(`${baseUrl}/?seed=not-a-number&motion=none`, { waitUntil: "networkidle" });
state = await readState(desktop);
assert.equal(state.seed, 42);
assert.equal(state.stock.count, 23);

await desktop.goto(`${baseUrl}/?scenario=unknown&motion=none`, { waitUntil: "networkidle" });
state = await readState(desktop);
assert.equal(state.seed, 42);
assert.equal(state.stock.count, 23);

await desktop.click('[data-action="hint"]');
state = await readState(desktop);
assert.ok(state.hint);

await desktop.click('[data-action="new"]');
state = await readState(desktop);
assert.equal(state.moves, 0);
assert.equal(state.stock.count, 24);
assert.notEqual(state.seed, 42);
await desktop.keyboard.press("f");
await desktop.waitForTimeout(100);
if (await desktop.evaluate(() => Boolean(document.fullscreenElement))) await desktop.keyboard.press("Escape");
await desktop.screenshot({ path: resolve(output, "desktop.png"), fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
watch(mobile);
await mobile.goto(`${baseUrl}/?seed=42&fresh=1&motion=none`, { waitUntil: "networkidle" });
let mobileState = await readState(mobile);
assert.equal(mobileState.canvas.width, 390);
assert.ok(mobileState.tableau.every((pile) => pile.cards.every((card) => card.rect.x >= 0 && card.rect.x + card.rect.w <= 390)));
assert.ok(mobileState.tableau[0].cards[0].rect.w >= 35);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert.ok(overflow <= 0);
const mobileCanvas = await mobile.locator("#game-canvas").boundingBox();
const mobileStock = center(mobileState.stock.rect);
await mobile.touchscreen.tap(mobileCanvas.x + mobileStock.x, mobileCanvas.y + mobileStock.y);
mobileState = await readState(mobile);
assert.equal(mobileState.stock.count, 23);
assert.equal(mobileState.waste.count, 1);
await mobile.screenshot({ path: resolve(output, "mobile.png"), fullPage: true });

const victory = await browser.newPage({ viewport: { width: 1280, height: 720 } });
watch(victory);
await victory.goto(`${baseUrl}/?scenario=won&motion=none`, { waitUntil: "networkidle" });
const victoryState = await readState(victory);
assert.equal(victoryState.status, "won");
await victory.screenshot({ path: resolve(output, "victory.png"), fullPage: true });

await browser.close();
assert.deepEqual(errors, []);
console.log("Browser smoke checks passed: drag, click, double-click, keyboard, undo, stock, restore, hint, fullscreen, touch/mobile layout, and win state.");
