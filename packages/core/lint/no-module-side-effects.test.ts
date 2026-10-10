import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import { expect, it } from "vitest";
import plugin from "./no-module-side-effects.js";

const oxlint = join(import.meta.dirname, "../../../node_modules/.bin/oxlint");
const rule = plugin.rules["no-module-side-effects"];

function lint(code: string): number {
	const dir = mkdtempSync(join(tmpdir(), "flare-pure-"));
	const file = join(dir, "src/shared/call.ts");
	try {
		writeFileSync(
			join(dir, ".oxlintrc.json"),
			JSON.stringify({
				plugins: [],
				categories: { correctness: "off", suspicious: "off" },
				jsPlugins: [{ name: "flare", specifier: join(import.meta.dirname, "no-module-side-effects.js") }],
				rules: { "flare/no-module-side-effects": "error" },
			}),
		);
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, code);
		const testFile = join(dir, "src/shared/call.test.ts");
		writeFileSync(testFile, "foo();\n");
		visit(file, code);
		visit(testFile, "foo();\n");
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

it("no-module-side-effects", () => {
	const offender = lint("/* keep */\nfoo();\nfunction inner() {\n\tbar();\n}\n1;\n");
	const clean = lint("/* @__PURE__ */ foo();\n");
	expect(offender).not.toBe(0);
	expect(clean).toBe(0);
});
