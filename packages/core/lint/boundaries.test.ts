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
