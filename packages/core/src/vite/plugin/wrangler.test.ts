import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { jsonOf, readWrangler } from "./wrangler.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(files: Record<string, string> = {}): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-wrangler-"));
	roots.push(dir);
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
	return dir;
}

// Comments and whitespace outside strings go, and so does a comma before a closing brace or bracket. A string keeps
// its `//`, its `/*`, and a `,}` inside it.
it("jsonc", () => {
	const text = `{
	// a line comment
	"name": "app", /* a block */
	"url": "http://x//y/*z*/",
	"odd": ",}",
	"quote": "a\\"b",
	"flags": ["nodejs_compat",],
	"assets": { "binding": "ASSETS", },
}`;
	expect(JSON.parse(jsonOf(text))).toEqual({
		name: "app",
		url: "http://x//y/*z*/",
		odd: ",}",
		quote: 'a"b',
		flags: ["nodejs_compat"],
		assets: { binding: "ASSETS" },
	});
	expect(jsonOf('{"a": 1} // end')).toBe('{"a":1}');
	expect(jsonOf('{"a": 1} /* open')).toBe('{"a":1}');
});

// The two fields flare reads: the worker entry the config names, which must be flare's (B109), and the assets binding
// that entry forwards to.
it("fields", () => {
	const config = `{
	"name": "app",
	"main": "@lovrozagar/flare/worker",
	"compatibility_date": "2026-07-01",
	"assets": { "binding": "ASSETS", "directory": "dist/client" },
}`;
	expect(readWrangler(root({ "wrangler.jsonc": config }))).toEqual({
		main: "@lovrozagar/flare/worker",
		binding: "ASSETS",
	});
	expect(readWrangler(root({ "wrangler.json": '{"name":"app"}' }))).toEqual({});
	expect(readWrangler(root({ "wrangler.json": '{"assets":"x","main":1}' }))).toEqual({});
	expect(() => readWrangler(root({ "wrangler.json": "[1]" }))).toThrow(/is not an object/);
	expect(() => readWrangler(root({ "wrangler.json": "null" }))).toThrow(/is not an object/);
});

it("absent", () => {
	expect(readWrangler(root())).toBeUndefined();
});

// flare reads two fields and takes no TOML dependency for them.
it("toml", () => {
	expect(() => readWrangler(root({ "wrangler.toml": 'name = "app"\n' }))).toThrow(/wrangler\.jsonc/);
});
