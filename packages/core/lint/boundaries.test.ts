import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import { expect, it } from "vitest";
import plugin from "./boundaries.js";

const oxlint = join(import.meta.dirname, "../../../node_modules/.bin/oxlint");
const rule = plugin.rules.boundaries;

function lint(files: Record<string, string>): number {
	const dir = mkdtempSync(join(tmpdir(), "flare-boundaries-"));
	try {
		writeFileSync(
			join(dir, ".oxlintrc.json"),
			JSON.stringify({
				plugins: [],
				categories: { correctness: "off", suspicious: "off" },
				jsPlugins: [{ name: "flare", specifier: join(import.meta.dirname, "boundaries.js") }],
				rules: { "flare/boundaries": "error" },
			}),
		);
		for (const [name, body] of Object.entries(files)) {
			mkdirSync(join(dir, name, ".."), { recursive: true });
			writeFileSync(join(dir, name), body);
		}
		for (const [name, body] of Object.entries(files)) visit(join(dir, name), body);
		const proc = spawnSync(oxlint, ["--config", join(dir, ".oxlintrc.json"), dir], { encoding: "utf8" });
		return proc.status ?? 1;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function visit(filename: string, code: string): void {
	const parsed = parseSync(filename, code);
	const visitors = rule.create({
		filename,
		report() {},
		sourceCode: {
			getText: () => code,
			getAllComments: () => parsed.comments,
			getCommentsBefore(node: { start: number }) {
				return parsed.comments.filter((comment) => code.slice(comment.end, node.start).trim() === "");
			},
		},
	});
	walk(parsed.program, null, visitors);
}

function walk(node: unknown, parent: unknown, visitors: Record<string, (node: never) => void>): void {
	if (typeof node !== "object" || node === null || !("type" in node)) return;
	const record = node as { type: string; parent?: unknown };
	record.parent = parent;
	visitors[record.type]?.(record as never);
	for (const [key, value] of Object.entries(record)) {
		if (key === "parent") continue;
		if (Array.isArray(value)) {
			for (const item of value) walk(item, record, visitors);
			continue;
		}
		walk(value, record, visitors);
	}
}

it("boundaries", () => {
	const offender = lint({
		"src/shared/node.ts": 'import fs from "node:fs";\nexport const disk = fs;\n',
		"src/features/theme/shared/cross.ts":
			'import { dir } from "../../direction/shared/dir.ts";\nimport { page } from "../client/page.ts";\nimport fs from "node:fs";\nexport const value = dir ?? page ?? fs;\n',
		"outside.js": 'import fs from "node:fs";\n',
		"src/shared/node.test.ts": 'import fs from "node:fs";\nexport const disk = fs;\n',
	});
	const clean = lint({
		"src/server/clean.ts":
			'import { shared } from "../shared/ok.ts";\nimport { local } from "./local.ts";\nimport "solid-js";\nexport const value = shared ?? local;\n',
		"src/features/theme/shared/use-shared.ts":
			'import { shared } from "../../../shared/ok.ts";\nimport { local } from "./local.ts";\nexport const value = shared ?? local;\n',
		"tests/e2e/apps/minimal/src/page.ts": 'import { router } from "./router.ts";\nexport const page = router;\n',
	});
	expect(offender).not.toBe(0);
	expect(clean).toBe(0);
});

it("vite dev adapters", () => {
	const dev = lint({
		"src/vite/dev/handler.ts":
			'import { createNodeListener } from "../../adapters/node/index.ts";\nexport const listen = createNodeListener;\n',
	});
	const plugin = lint({
		"src/vite/plugin/flare.ts":
			'import { createNodeListener } from "../../adapters/node/index.ts";\nexport const listen = createNodeListener;\n',
	});
	const bun = lint({
		"src/vite/dev/handler.ts":
			'import { createBunFetch } from "../../adapters/bun/index.ts";\nexport const serve = createBunFetch;\n',
	});
	expect(dev).toBe(0);
	expect(plugin).not.toBe(0);
	expect(bun).not.toBe(0);
});

it("vite node", () => {
	const vite = lint({
		"src/vite/route-meta/hash.ts": 'import { createHash } from "node:crypto";\nexport const hash = createHash;\n',
	});
	const server = lint({
		"src/server/hash.ts": 'import { createHash } from "node:crypto";\nexport const hash = createHash;\n',
	});
	expect(vite).toBe(0);
	expect(server).not.toBe(0);
});

// The three providers may import the cross-tab channel through its index. No other feature file may import client/,
// and a provider may not reach past that index (00-rules).
it("sync import", () => {
	const index = 'import { post } from "../../../client/sync/index.ts";\nexport const send = post;\n';
	for (const feature of ["theme", "direction", "i18n"])
		expect(lint({ [`src/features/${feature}/shared/provider.tsx`]: index })).toBe(0);
	expect(lint({ "src/features/theme/shared/script.tsx": index })).not.toBe(0);
	expect(lint({ "src/features/image/shared/provider.tsx": index })).not.toBe(0);
	const channel = 'import { post } from "../../../client/sync/channel.ts";\nexport const send = post;\n';
	expect(lint({ "src/features/theme/shared/provider.tsx": channel })).not.toBe(0);
	const navigation = 'import { navigate } from "../../../client/navigation/index.ts";\nexport const go = navigate;\n';
	expect(lint({ "src/features/i18n/shared/provider.tsx": navigation })).not.toBe(0);
});

// The Node adapter and the filesystem store may import Node builtins. The Workers adapter and the Cache API store
// may not.
it("node adapters", () => {
	const fs = 'import { readFile } from "node:fs/promises";\nexport const read = readFile;\n';
	expect(lint({ "src/adapters/node/disk.ts": fs })).toBe(0);
	expect(lint({ "src/adapters/stores/fs/disk.ts": fs })).toBe(0);
	expect(lint({ "src/adapters/workers/disk.ts": fs })).not.toBe(0);
	expect(lint({ "src/adapters/stores/cache-api/disk.ts": fs })).not.toBe(0);
});

// vite/ composes a feature's vite factory. It reaches no other side of a feature.
it("vite features", () => {
	const factory =
		'import { imagePlugin } from "../../features/image/vite/index.ts";\nexport const plugin = imagePlugin;\n';
	expect(lint({ "src/vite/plugin/flare.ts": factory })).toBe(0);
	const shared = 'import { Image } from "../../features/image/shared/index.ts";\nexport const image = Image;\n';
	expect(lint({ "src/vite/plugin/flare.ts": shared })).not.toBe(0);
});

// The font generator runs in Node at authoring time: it may read and write files and import its own feature's shared
// side. No other file outside a feature side may import a builtin, and it may not reach another feature.
it("font generate", () => {
	const generator =
		'import { readFileSync } from "node:fs";\nimport type { Font } from "./shared/create-font.ts";\nexport const read = readFileSync;\nexport type F = Font;\n';
	expect(lint({ "src/features/fonts/generate.ts": generator })).toBe(0);
	expect(lint({ "src/features/image/generate.ts": generator })).not.toBe(0);
	const other = 'import { Image } from "../image/shared/index.ts";\nexport const image = Image;\n';
	expect(lint({ "src/features/fonts/generate.ts": other })).not.toBe(0);
});
