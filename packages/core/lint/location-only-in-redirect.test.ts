import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import { expect, it } from "vitest";
import plugin from "./location-only-in-redirect.js";

const oxlint = join(import.meta.dirname, "../../../node_modules/.bin/oxlint");
const code = `headers.set("Location", url);\nheaders.set("X-Request-Id", url);\nheaders.get("Location");\n`;

function lint(rel: string): number {
	const dir = mkdtempSync(join(tmpdir(), "flare-location-"));
	const file = join(dir, rel);
	try {
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(
			join(dir, ".oxlintrc.json"),
			JSON.stringify({
				plugins: [],
				categories: { correctness: "off" },
				jsPlugins: [{ name: "flare", specifier: join(import.meta.dirname, "location-only-in-redirect.js") }],
				rules: { "flare/location-only-in-redirect": "error" },
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
	const visitors = plugin.rules["location-only-in-redirect"].create({ filename, report() {}, sourceCode: {} });
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

it("Location outside redirect", () => {
	expect(lint("src/server/loaders/run.ts")).not.toBe(0);
});

it("Location inside builder", () => {
	expect(lint("src/server/redirect/builder.ts")).toBe(0);
});
