import { createComponent, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, it } from "vitest";
import { ViewTransitionCSS } from "./view-transition-css.tsx";

type FlareScope = typeof globalThis & { flare?: { nonce: string } };

afterEach(() => {
	delete (globalThis as FlareScope).flare;
});

function styleOf(props: { duration?: number }, requestNonce = "n"): HTMLStyleElement {
	(globalThis as FlareScope).flare = { nonce: requestNonce };
	const host = document.createElement("div");
	render(() => createComponent(ViewTransitionCSS, props), host);
	flush();
	const style = host.querySelector("style");
	if (style === null) throw new Error("no style");
	return style;
}

// 150 ms by default, the user's decision of 2026-10-15 (B125).
it("default duration", () => {
	const style = styleOf({});
	expect(style.textContent).toBe(
		"@view-transition{navigation:auto}::view-transition-old(root){display:none}::view-transition-old(*),::view-transition-new(*){animation-duration:150ms}@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}",
	);
	expect(style.getAttribute("nonce")).toBe("n");
	expect(styleOf({}, "").hasAttribute("nonce")).toBe(false);
});

it("custom duration", () => {
	expect(styleOf({ duration: 300 }).textContent).toContain("animation-duration:300ms");
});

it("reduced motion", () => {
	expect(styleOf({}).textContent).toMatch(
		/@media \(prefers-reduced-motion:reduce\)\{::view-transition-group\(\*\),::view-transition-old\(\*\),::view-transition-new\(\*\)\{animation:none\}\}$/,
	);
});

// The document transition's old snapshot is hidden, so a capture that comes out white never shows (Chromium 573693508,
// BUGS.md 119.15, B125); the new state fades in over the page. The rule sits outside the reduced-motion query, so it
// holds with motion on or off, and it names only the root group, so an app's own named groups keep both images.
it("old root hidden", () => {
	const text = styleOf({}).textContent ?? "";
	const rule = "::view-transition-old(root){display:none}";
	expect(text).toContain(rule);
	expect(text.indexOf(rule)).toBeLessThan(text.indexOf("@media"));
	expect(text.match(/::view-transition-old\([^*)]+\)/g)).toEqual(["::view-transition-old(root)"]);
});
