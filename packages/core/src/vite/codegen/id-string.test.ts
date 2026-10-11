import { expect, it } from "vitest";
import { assertId, writeId } from "./id-string.ts";

const home = "_root_/home.page.tsx";
const about = "_root_/about/about.page.tsx";
const source = `export default createPage("");\n`;

it("writes the key", () => {
	const next = writeId(source, home);
	expect(next).toContain('createPage("_root_")');
	expect(() => assertId(next, home)).not.toThrow();
});

it("rewrites on move", () => {
	const moved = writeId(writeId(source, home), about);
	expect(moved).toContain('createPage("_root_/about")');
	expect(moved).not.toContain('createPage("_root_")');
});

it("mismatch fails", () => {
	expect(() => assertId(`export default createPage("hand-edited");\n`, home)).toThrow(home);
});

it("no route", () => {
	expect(() => writeId(source, "_parts/widget.tsx")).toThrow("_parts/widget.tsx");
});
