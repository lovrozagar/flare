import { expect, it } from "vitest";
import { stylesheetMarkup, SWAP_SCRIPT } from "./delivery.ts";

const HREF = "/assets/app.css";

it("prod markup", () => {
	expect(stylesheetMarkup(HREF, "n")).toEqual([
		{ tag: "link", props: { id: "flare-stylesheet", rel: "preload", as: "style", href: HREF } },
		{ tag: "noscript", props: {}, children: { tag: "link", props: { rel: "stylesheet", href: HREF } } },
		{ tag: "script", props: { nonce: "n" }, children: SWAP_SCRIPT },
	]);
});

// The script turns the preloaded link into the stylesheet. The browser already fetches the file.
it("script constant", () => {
	expect(SWAP_SCRIPT).toBe('document.getElementById("flare-stylesheet").rel="stylesheet"');
	expect(SWAP_SCRIPT).not.toMatch(/fetch|XMLHttpRequest|import|href/);
});

it("no inline style", () => {
	const tags = [...stylesheetMarkup(HREF, "n"), ...stylesheetMarkup(HREF, "")];
	expect(tags.map((tag) => tag.tag)).not.toContain("style");
});

// A string or `false` CSP has no nonce, and would block an un-nonced script (B68).
it("no nonce", () => {
	expect(stylesheetMarkup(HREF, "")).toEqual([{ tag: "link", props: { rel: "stylesheet", href: HREF } }]);
});
