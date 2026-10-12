import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import App from "../src/App.jsx";
import { seedState } from "../src/data/seed.js";

/*
 * The desktop layout (ADR-34) is CSS only, switched on by min-width media queries,
 * so the phone layout cannot change: every desktop rule sits inside such a query,
 * and the markup only gains class names the phone styles never mention.
 *
 * jsdom does no layout, so what is tested here is the contract: the hooks exist in
 * the markup, and the stylesheet only ever styles them inside a min-width query.
 * The look itself was checked with screenshots at 1440 and 390 px wide.
 */

const css = readFileSync("src/ui/styles.css", "utf8");   // vitest runs from the repo root
const HOOKS = ["app-body", "app-main", "week-days", "chain-grid", "card-list", "narrow"];

/* The stylesheet with every @media (min-width: …) and @media print block cut out:
   what a phone sees on screen. */
function outsideMinWidthQueries(text) {
  let out = "", i = 0;
  const re = /@media\s*(?:\(\s*min-width\s*:[^)]*\)|print)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    out += text.slice(i, m.index);
    let depth = 1, j = re.lastIndex;
    while (depth && j < text.length) { if (text[j] === "{") depth++; else if (text[j] === "}") depth--; j++; }
    i = j; re.lastIndex = j;
  }
  return out + text.slice(i);
}

describe("the stylesheet", () => {
  test("styles every desktop hook inside a min-width query", () => {
    for (const h of HOOKS.filter((x) => x !== "app-main")) expect(css).toMatch(new RegExp(`\\.${h}\\b`));
  });

  test("outside min-width queries, no desktop hook is styled — except app-main, which takes over the old classes 1:1", () => {
    const phone = outsideMinWidthQueries(css);
    for (const h of HOOKS.filter((x) => x !== "app-main")) expect(phone).not.toMatch(new RegExp(`\\.${h}\\b`));
    /* app-main replaces `mx-auto w-full max-w-2xl` + the inline 84 px bottom padding,
       so on a phone it must say exactly that. */
    expect(phone).toMatch(/\.app-main\{width:100%;max-width:42rem;margin:0 auto;padding-bottom:84px;\}/);
  });
});

function fakeStorage(initial) {
  const rows = new Map([["fuvarterv:v1", JSON.stringify(initial)]]);
  return {
    async get(key) { return { key, value: rows.get(key) }; },
    async set(key, value) { rows.set(key, value); return { key, value }; },
    async delete(key) { rows.delete(key); return { key, deleted: true }; },
    async list() { return { keys: [...rows.keys()] }; },
  };
}

let container, root;
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); vi.useRealTimers(); });

const tab = async (label) => {
  const b = [...container.querySelectorAll("nav button")].find((x) => x.textContent.trim() === label);
  await act(async () => b.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("the markup carries the hooks", () => {
  test("nav and main sit side by side in the app body; every screen gets its hook", async () => {
    window.storage = fakeStorage(seedState());
    await act(async () => { root = createRoot(container); root.render(<App />); });
    await act(async () => { await Promise.resolve(); });

    const body = container.querySelector(".app-body");
    expect(body.querySelector(":scope > nav.tabbar")).toBeTruthy();
    expect(body.querySelector(":scope > main.app-main")).toBeTruthy();

    expect(container.querySelector(".week-days section")).toBeTruthy();
    await tab("Beosztás");
    expect(container.querySelector(".chain-grid")).toBeTruthy();
    await tab("Adatok");
    expect(container.querySelector(".card-list")).toBeTruthy();
    await tab("Sofőr");
    expect(container.querySelector("main .narrow")).toBeTruthy();
  });
});
