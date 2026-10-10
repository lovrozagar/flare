// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { RouteDefinition } from "../../../src/generators/index.ts";
import { generateRoutesFile } from "../../../src/generators/index.ts";

const CORE = resolve(import.meta.dirname, "../../..");
const TYPES_PATH = join(CORE, "src/router-primitives/types.ts");
const TSC = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin/tsc");

function makeDef(i: number, overrides: Partial<RouteDefinition>): RouteDefinition {
	return {
		authenticateMode: false,
		cache: {},
		exportName: "route",
		filePath: `src/routes/p${i}.tsx`,
		hasInput: false,
		responseRoute: false,
		type: "page",
		virtualPath: `_root_/p${i}`,
		...overrides,
	};
}

/* One page per meta field (and value shape) codegen can emit. */
const DEFS: RouteDefinition[] = [
	makeDef(0, { authenticateMode: true }),
	makeDef(1, { authenticateMode: "optional" }),
	makeDef(2, { hasAuthorize: true }),
	makeDef(3, { cache: { cdnTags: ["a", "b"] } }),
	makeDef(4, {
		cache: {
			client: {
				cacheDeferred: true,
				gcTime: 1,
				prefetch: "intent",
				prefetchGcTime: 2,
				prefetchStaleTime: 3,
				staleTime: 4,
			},
		},
	}),
	makeDef(5, { cache: { client: { prefetch: false } } }),
	makeDef(6, { cache: { isr: true, isrDefer: "stream", isrDynamicParams: false, isrRevalidate: 60 } }),
	makeDef(7, { cache: { ssg: true, ssgDefer: "resolve" } }),
	makeDef(8, { intercept: { from: ["/a"], render: "modal" } }),
];

function metaDecls(source: string): string[] {
	return source.split("\n").filter((line) => /^const O\d+ = .* as const$/.test(line));
}

/** Typecheck one file with `tsc` (TypeScript 7 has no in-process compiler API). Returns error lines. */
function typecheck(body: string): string[] {
	const dir = mkdtempSync(join(tmpdir(), "flare-meta-types-"));
	try {
		writeFileSync(join(dir, "meta.ts"), body);
		writeFileSync(
			join(dir, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					allowImportingTsExtensions: true,
					module: "ESNext",
					moduleResolution: "bundler",
					noEmit: true,
					skipLibCheck: true,
					strict: true,
					target: "ESNext",
					types: [],
				},
				files: ["meta.ts"],
			}),
		);
		const result = spawnSync(TSC, ["-p", dir], { encoding: "utf-8" });
		if (result.error) throw result.error;
		return `${result.stdout}${result.stderr}`.split("\n").filter((line) => line.includes("error TS"));
	} finally {
		rmSync(dir, { force: true, recursive: true });
	}
}

describe("generated route meta satisfies RouteMeta", () => {
	it("emits one meta constant per distinct field shape", () => {
		expect(metaDecls(generateRoutesFile(DEFS, "src/_gen"))).toHaveLength(DEFS.length);
	});

	it("every emitted meta constant typechecks as RouteMeta", () => {
		const decls = metaDecls(generateRoutesFile(DEFS, "src/_gen"));
		const checks = decls.map((d) => {
			const name = d.split(" ")[1];
			return `export const _${name}: RouteMeta = ${name};`;
		});
		const body = [`import type { RouteMeta } from ${JSON.stringify(TYPES_PATH)};`, ...decls, ...checks].join("\n");
		expect(typecheck(body)).toEqual([]);
	});
});
