import { expect, it } from "vitest";
import { scanRoute } from "./scan.ts";

it("parse error", () => {
	expect(() => scanRoute("bad.tsx", "const =")).toThrow(/bad\.tsx/);
});

it("comment", () => {
	expect(scanRoute("comment.tsx", 'import "solid-js"; /* page.authenticate( */ const x = 1;').auth).toBeUndefined();
});

it("string", () => {
	expect(scanRoute("string.tsx", 'const text = ".authenticate(";').auth).toBeUndefined();
});

it("regex", () => {
	expect(scanRoute("regex.tsx", "const pattern = /\\.authenticate\\(/;").auth).toBeUndefined();
});

it("call", () => {
	expect(scanRoute("auth.tsx", "page.authenticate();").auth).toBe(true);
	expect(scanRoute("optional.tsx", "page.authenticateOptional();").auth).toBe("optional");
});

it("intercept literals", () => {
	const source = 'page.intercept({ from: ["_root_/gallery"], render: "preview" });';
	const scan = scanRoute("gallery.tsx", source);
	expect(scan.intercept?.from).toEqual(["_root_/gallery"]);
	expect(scan.intercept?.render).toBe("preview");
	expect(scan.intercept?.spans).toEqual([
		{ start: source.indexOf('"_root_/gallery"'), end: source.indexOf('"_root_/gallery"') + '"_root_/gallery"'.length },
	]);
});

it("computed from", () => {
	const source = 'const id = "_root_/gallery"; page.intercept({ from: id, render: "preview" });';
	expect(() => scanRoute("computed.tsx", source)).toThrow(/computed\.tsx/);
	expect(() => scanRoute("computed.tsx", source)).toThrow(/intercept/);
});

it("query import", () => {
	expect(scanRoute("query.tsx", 'import "@lovrozagar/flare/query";').query).toBe(true);
	expect(scanRoute("note.tsx", "/* @lovrozagar/flare/query */ const x = 1;").query).toBe(false);
});

function sides(chain: string) {
	return scanRoute("a.page.tsx", `export const route = createPage("_root_/a")${chain};`).input;
}

it("input sides", () => {
	expect(sides(".input({ params: p, searchParams: s }).render(r)")).toEqual({ params: true, search: true });
	expect(sides('.input({ searchParams: s, ...rest, "params": p }).render(r)')).toEqual({ params: true, search: true });
	expect(sides(".input(config).render(r)")).toEqual({ params: false, search: false });
	expect(sides(".render(r)")).toEqual({ params: false, search: false });
	expect(scanRoute("a.page.tsx", 'export const route = createPage("x").authorize(a).render(r);').authorize).toBe(true);
});
