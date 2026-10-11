import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import { expect, it } from "vitest";
import plugin from "./path-prefix.js";

const oxlint = join(import.meta.dirname, "../../../node_modules/.bin/oxlint");

function lint(code: string): number {
	const dir = mkdtempSync(join(tmpdir(), "flare-prefix-"));
	const file = join(dir, "src/shared/pathname.ts");
	try {
		mkdirSync(join(dir, "src/shared"), { recursive: true });
		writeFileSync(
			join(dir, ".oxlintrc.json"),
			JSON.stringify({
				plugins: [],
				categories: { correctness: "off" },
				jsPlugins: [{ name: "flare", specifier: join(import.meta.dirname, "path-prefix.js") }],
				rules: { "flare/path-prefix": "error" },
			}),
		);
		writeFileSync(file, code);
		exercise(file, code);
		const proc = spawnSync(oxlint, ["--config", join(dir, ".oxlintrc.json"), dir], { encoding: "utf8" });
		return proc.status ?? 1;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function exercise(filename: string, code: string): void {
	const parsed = parseSync(filename, code);
	const visitors = plugin.rules["path-prefix"].create({ filename, report() {}, sourceCode: {} });
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

it("startsWith banned", () => {
	expect(lint(`pathname.startsWith("/admin");\n`)).not.toBe(0);
	expect(lint(`pathname.endsWith("/admin");\n`)).not.toBe(0);
});

it("helper allowed", () => {
	expect(lint(`hasPathPrefix(pathname, "/admin");\npathname.includes("/admin");\n`)).toBe(0);
});
