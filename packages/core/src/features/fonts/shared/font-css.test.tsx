import { createComponent, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, it, vi } from "vitest";
import { createFont, registryFont, type Font } from "./create-font.ts";
import { FontCSS, type FontCSSProps } from "./font-css.tsx";

type FlareScope = typeof globalThis & { flare?: { nonce: string } };

afterEach(() => {
	delete (globalThis as FlareScope).flare;
});

const inter = registryFont({
	family: "Inter",
	category: "sans-serif",
	files: [
		{ subset: "latin", style: "normal", weight: "400", url: "/fonts/inter/latin.woff2", unicodeRange: "U+0000-00FF" },
		{ subset: "latin", style: "italic", weight: "400", url: "/fonts/inter/latin-i.woff2", unicodeRange: "U+0000-00FF" },
		{ subset: "greek", style: "normal", weight: "400", url: "/fonts/inter/greek.woff2", unicodeRange: "U+0370-03FF" },
	],
});

function mount(props: FontCSSProps, nonce = "n"): HTMLElement {
	(globalThis as FlareScope).flare = { nonce };
	const host = document.createElement("div");
	render(() => createComponent(FontCSS, props), host);
	flush();
	return host;
}

function links(host: HTMLElement): string[] {
	return [...host.querySelectorAll("link")].map((link) => link.outerHTML);
}

it("nonce", () => {
	const style = mount({ font: inter }, "r1").querySelector("style");
	expect(style?.getAttribute("nonce")).toBe("r1");
	expect(style?.textContent).toContain('font-family:"Inter"');
	expect(mount({ font: inter }, "").querySelector("style")?.hasAttribute("nonce")).toBe(false);
});

it("preload", () => {
	expect(links(mount({ font: inter }))).toEqual([
		'<link rel="preload" as="font" type="font/woff2" crossorigin="" href="/fonts/inter/latin.woff2">',
	]);
	const local = createFont({ family: "Brand", src: "/fonts/brand.woff2", category: "serif" });
	expect(links(mount({ font: local }))).toEqual([
		'<link rel="preload" as="font" type="font/woff2" crossorigin="" href="/fonts/brand.woff2">',
	]);
	expect(links(mount({ font: inter, preload: "greek" }))).toEqual([
		'<link rel="preload" as="font" type="font/woff2" crossorigin="" href="/fonts/inter/greek.woff2">',
	]);
});

it("preload off", () => {
	expect(links(mount({ font: inter, preload: false }))).toEqual([]);
});

it("unknown subset", () => {
	expect(() => mount({ font: inter, preload: "nope" })).toThrow("Inter has no nope subset");
	expect(() => mount({ font: inter, subsets: ["nope"] })).toThrow("Inter has no nope subset");
});

it("no latin", () => {
	const greek = registryFont({
		family: "Greek",
		category: "serif",
		files: [{ subset: "greek", style: "normal", weight: "400", url: "/fonts/g.woff2", unicodeRange: "U+0370-03FF" }],
	});
	expect(links(mount({ font: greek }))).toEqual([]);
});

it("subsets", () => {
	const css = vi.fn<Font["css"]>(() => "@font-face{}");
	mount({ font: { ...inter, css }, subsets: ["latin"] });
	expect(css).toHaveBeenCalledWith(["latin"]);
});
