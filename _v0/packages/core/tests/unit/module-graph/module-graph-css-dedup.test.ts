import { describe, expect, it } from "vitest";
import { resolveModulePreloads, resolveRoutePreloads } from "../../../src/module-graph/index.ts";

describe("resolveModulePreloads — CSS deduplication", () => {
	it("does not produce duplicate CSS entries when two imports share a CSS file", () => {
		const manifest = {
			"src/a.ts": {
				css: ["assets/shared.css"],
				file: "assets/a.js",
			},
			"src/b.ts": {
				css: ["assets/shared.css"],
				file: "assets/b.js",
			},
			"src/entry.ts": {
				css: ["assets/shared.css"],
				file: "assets/entry.js",
				imports: ["src/a.ts", "src/b.ts"],
				isEntry: true,
			},
		};

		const result = resolveModulePreloads(manifest, "src/entry.ts");
		const uniqueCss = new Set(result.css);
		expect(result.css.length).toBe(uniqueCss.size);
		expect(result.css).toEqual(["/assets/shared.css"]);
	});

	it("does not produce duplicate CSS when entry and import share CSS", () => {
		const manifest = {
			"src/dep.ts": {
				css: ["assets/common.css"],
				file: "assets/dep.js",
			},
			"src/entry.ts": {
				css: ["assets/common.css"],
				file: "assets/entry.js",
				imports: ["src/dep.ts"],
				isEntry: true,
			},
		};

		const result = resolveModulePreloads(manifest, "src/entry.ts");
		expect(result.css).toEqual(["/assets/common.css"]);
	});

	it("preserves distinct CSS files", () => {
		const manifest = {
			"src/dep.ts": {
				css: ["assets/b.css"],
				file: "assets/dep.js",
			},
			"src/entry.ts": {
				css: ["assets/a.css"],
				file: "assets/entry.js",
				imports: ["src/dep.ts"],
				isEntry: true,
			},
		};

		const result = resolveModulePreloads(manifest, "src/entry.ts");
		expect(result.css).toEqual(["/assets/a.css", "/assets/b.css"]);
	});
});

describe("resolveRoutePreloads — CSS deduplication", () => {
	it("does not produce duplicate CSS entries across route modules", () => {
		const manifest = {
			"src/routes/a.tsx": {
				css: ["assets/shared.css"],
				file: "assets/a.js",
				isDynamicEntry: true,
			},
			"src/routes/b.tsx": {
				css: ["assets/shared.css"],
				file: "assets/b.js",
				isDynamicEntry: true,
			},
		};

		const result = resolveRoutePreloads(manifest, ["src/routes/a.tsx", "src/routes/b.tsx"]);
		const uniqueCss = new Set(result.css);
		expect(result.css.length).toBe(uniqueCss.size);
		expect(result.css).toEqual(["/assets/shared.css"]);
	});
});
