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

it("default duration", () => {
	const style = styleOf({});
	expect(style.textContent).toBe(
		"@view-transition{navigation:auto}::view-transition-old(*),::view-transition-new(*){animation-duration:175ms}@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}",
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
