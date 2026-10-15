import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseSync } from "oxc-parser"
import { expect, it } from "vitest"
import plugin from "./funnel-only.js"

const oxlint = join(import.meta.dirname, "../../../node_modules/.bin/oxlint")
const rule = plugin.rules["funnel-only"]

function lint(code: string, relative: string): number {
	const dir = mkdtempSync(join(tmpdir(), "flare-funnel-"))
	const file = join(dir, relative)
	try {
		writeFileSync(
			join(dir, ".oxlintrc.json"),
			JSON.stringify({
				plugins: [],
				categories: { correctness: "off", suspicious: "off" },
				jsPlugins: [{ name: "flare", specifier: join(import.meta.dirname, "funnel-only.js") }],
				rules: { "flare/funnel-only": "error" },
			}),
		)
		mkdirSync(join(file, ".."), { recursive: true })
		writeFileSync(file, code)
		const parsed = parseSync(file, code)
		const reports: string[] = []
		const visitors = rule.create({
			filename: file,
			report(entry: { message: string }) {
				reports.push(entry.message)
			},
			sourceCode: { getText: () => code },
		})
		walk(parsed.program, null, visitors)
		const allowed = [
			"/finalize.ts",
			"/proxy.ts",
			"/vite/dev/handler.ts",
			"/server/render/dev-document.ts",
			"/vite/dev/guard.ts",
			"/features/image/vite/dev-endpoint.ts",
		].some((end) => relative.endsWith(end))
		expect(reports.length).toBe(allowed ? 0 : 1)
		const proc = spawnSync(oxlint, ["--config", join(dir, ".oxlintrc.json"), dir], { encoding: "utf8" })
		return proc.status ?? 1
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

function walk(node: unknown, parent: unknown, visitors: Record<string, (node: never) => void>): void {
	if (typeof node !== "object" || node === null || !("type" in node)) return
	const record = node as { type: string; parent?: unknown }
	record.parent = parent
	visitors[record.type]?.(record as never)
	for (const [key, value] of Object.entries(record)) {
		if (key === "parent") continue
		if (Array.isArray(value)) {
			for (const item of value) walk(item, record, visitors)
			continue
		}
		walk(value, record, visitors)
	}
}

it("new Response in loaders", () => {
	const status = lint(
		'export function load() {\n\treturn new Response();\n}\nexport function other() {\n\treturn 1;\n\treturn new URL("https://example.com");\n}\n',
		"src/server/loaders/run.ts",
	)
	expect(status).not.toBe(0)
})

it("new Response in finalize", () => {
	const status = lint("export function done() {\n\treturn new Response();\n}\n", "src/server/lifecycle/finalize.ts")
	expect(status).toBe(0)
})

it("new Response in proxy", () => {
	const status = lint(
		'export async function proxy() {\n\treturn new Response(await fetch("https://example.com/"));\n}\n',
		"src/server/proxy/proxy.ts",
	)
	expect(status).toBe(0)
})

it("dev handler", () => {
	const status = lint(
		'export function failed() {\n\treturn new Response("<pre>x</pre>", { status: 500 });\n}\n',
		"src/vite/dev/handler.ts",
	)
	expect(status).toBe(0)
})

// A dev document gets its dev tags after the pipeline answered, so its re-wrap is not a second finalize (B95 (b)).
it("dev document", () => {
	const status = lint(
		"export function tagged(body) {\n\treturn new Response(body, { status: 200 });\n}\n",
		"src/server/render/dev-document.ts",
	)
	expect(status).toBe(0)
})

it("dev guard", () => {
	const status = lint(
		"export function denied() {\n\treturn new Response(null, { status: 403 });\n}\n",
		"src/vite/dev/guard.ts",
	)
	expect(status).toBe(0)
})

// The image dev endpoint answers on the dev server, outside the pipeline, behind the dev guard (bits/13).
it("image endpoint", () => {
	const status = lint(
		"export function missing() {\n\treturn new Response(null, { status: 404 });\n}\n",
		"src/features/image/vite/dev-endpoint.ts",
	)
	expect(status).toBe(0)
})
