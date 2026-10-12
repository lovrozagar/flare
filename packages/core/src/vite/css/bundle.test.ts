import { expect, it } from "vitest";
import { stylesheetOf } from "./bundle.ts";

const ROOT = { base: "/", assetsBase: "/assets" };

const chunk = { type: "chunk", fileName: "assets/main-a1.js" } as const;
const sheet = (fileName: string, source: string | Uint8Array) => ({ type: "asset", fileName, source }) as const;

it("one href", () => {
	const bundle = { main: chunk, "style.css": sheet("assets/style-b2.css", ".a{color:red}") };
	expect(stylesheetOf(bundle, ROOT)).toEqual({
		fileName: "assets/style-b2.css",
		href: "/assets/style-b2.css",
		source: ".a{color:red}",
	});
	const bytes = { "style.css": sheet("assets/style-b2.css", new TextEncoder().encode(".b{top:0}")) };
	expect(stylesheetOf(bytes, ROOT)?.source).toBe(".b{top:0}");
});

it("none", () => {
	expect(stylesheetOf({ main: chunk, logo: sheet("assets/logo.svg", "<svg/>") }, ROOT)).toBeUndefined();
});

// One stylesheet is the contract: flare() turns CSS code splitting off for the client.
it("two", () => {
	const bundle = { a: sheet("assets/a.css", ""), b: sheet("assets/b.css", "") };
	expect(() => stylesheetOf(bundle, ROOT)).toThrow(/assets\/a\.css.*assets\/b\.css/);
});

it("base", () => {
	const bundle = { "style.css": sheet("assets/style-b2.css", "") };
	expect(stylesheetOf(bundle, { base: "/app/", assetsBase: "/assets" })?.href).toBe("/app/assets/style-b2.css");
	expect(stylesheetOf(bundle, { base: "https://cdn.example.com/", assetsBase: "/assets" })?.href).toBe(
		"https://cdn.example.com/assets/style-b2.css",
	);
	// Under `assetsBase: "/"` the files stay in `assets/`, and the URL prefix is `/` (B89).
	expect(stylesheetOf(bundle, { base: "/", assetsBase: "/" })?.href).toBe("/style-b2.css");
});
