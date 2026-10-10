import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_REGISTRY } from "../../../src/fonts/registry.gen.ts";

/* `flare font add` downloads each file a font module serves from font-urls.gen.json: a module
   whose local URL has no CDN entry installs with missing files. */
const fontsDir = resolve(__dirname, "../../../src/fonts");
const urls = JSON.parse(readFileSync(resolve(fontsDir, "font-urls.gen.json"), "utf-8")) as Record<string, string>;

describe("font-urls.gen.json", () => {
	it("has a CDN URL for every file every registered font serves", () => {
		const missing: string[] = [];
		for (const [, slug] of FONT_REGISTRY) {
			const source = readFileSync(resolve(fontsDir, `${slug}.ts`), "utf-8");
			for (const match of source.matchAll(/url: "(\/fonts\/[^"]+)"/g)) {
				const local = match[1] as string;
				if (!urls[local]?.startsWith("https://fonts.gstatic.com/")) missing.push(local);
			}
		}
		expect(missing).toEqual([]);
	});

	it("registers Geist and Geist Mono", () => {
		const families = FONT_REGISTRY.map(([family]) => family);
		expect(families).toContain("Geist");
		expect(families).toContain("Geist Mono");
	});
});
