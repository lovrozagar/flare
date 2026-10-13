import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import { expect, it } from "vitest";
import plugin from "./no-flare-header-branching.js";

const oxlint = join(import.meta.dirname, "../../../node_modules/.bin/oxlint");
const rule = plugin.rules["no-flare-header-branching"];

function lint(code: string, relative: string, reported?: number): number {
	const dir = mkdtempSync(join(tmpdir(), "flare-header-"));
	const file = join(dir, relative);
	try {
		writeFileSync(
			join(dir, ".oxlintrc.json"),
			JSON.stringify({
				plugins: [],
				categories: { correctness: "off", suspicious: "off" },
				jsPlugins: [{ name: "flare", specifier: join(import.meta.dirname, "no-flare-header-branching.js") }],
				rules: { "flare/no-flare-header-branching": "error" },
			}),
		);
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, code);
		const parsed = parseSync(file, code);
		const reports: string[] = [];
		const visitors = rule.create({
			filename: file,
			report(entry: { message: string }) {
				reports.push(entry.message);
			},
			sourceCode: { getText: () => code },
		});
		walk(parsed.program, null, visitors);
		const allowed = relative.endsWith("/finalize.ts") || relative.startsWith("src/client/");
		expect(reports.length).toBe(reported ?? (allowed ? 0 : 4));
		const proc = spawnSync(oxlint, ["--config", join(dir, ".oxlintrc.json"), dir], { encoding: "utf8" });
		return proc.status ?? 1;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
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

it("request header", () => {
	const status = lint(
		'export function read(request, headers, seen, name) {\n\tother();\n\tseen.get("flare-isr");\n\trequest.foo.get("flare-isr");\n\theaders.set(name, "1");\n\trequest.headers.get(name);\n\trequest.headers.get("accept");\n\trequest.headers.get("Flare-ISR");\n\theaders.set("flare-cache", "hit");\n\treturn request.headers.get("flare-isr");\n}\n',
		"src/server/lifecycle/order.ts",
	);
	expect(status).not.toBe(0);
});

it("response header", () => {
	const status = lint(
		'export function done(headers) {\n\theaders.set("flare-render", "ssr");\n}\n',
		"src/server/lifecycle/finalize.ts",
	);
	expect(status).toBe(0);
});

it("client response header", () => {
	const status = lint(
		'export function read(response, BUILD) {\n\tresponse.headers.get("flare-build");\n\tresponse.headers.get(BUILD);\n\tresponse.headers.get("Flare-Render");\n\treturn response.headers.get("flare-cache");\n}\n',
		"src/client/navigation/navigate.ts",
	);
	expect(status).toBe(0);
});

// B40's one exception: the dev-only tab header routes a dev payload and changes no response (BUGS.md B42). Only that
// literal or the `TAB_HEADER` identifier passes. Another flare- header and a non-literal are still reported.
it("dev tab header", () => {
	const status = lint(
		'export function tab(request, TAB_HEADER, name) {\n\trequest.headers.get(TAB_HEADER);\n\trequest.headers.set("flare-dev-tab", "t");\n\trequest.headers.get("flare-data");\n\treturn request.headers.get(name);\n}\n',
		"src/vite/dev/handler.ts",
		2,
	);
	expect(status).not.toBe(0);
});
