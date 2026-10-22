import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseSync } from "oxc-parser"
import { expect, it } from "vitest"
import { lintVerdict } from "./oxlint.ts"
import plugin from "./no-module-state.js"

const rule = plugin.rules["no-module-state"]

function lint(code: string): 0 | 1 {
	const dir = mkdtempSync(join(tmpdir(), "flare-state-"))
	const file = join(dir, "src/shared/state.ts")
	try {
		writeFileSync(
			join(dir, ".oxlintrc.json"),
			JSON.stringify({
				plugins: [],
				categories: { correctness: "off", suspicious: "off" },
				jsPlugins: [{ name: "flare", specifier: join(import.meta.dirname, "no-module-state.js") }],
				rules: { "flare/no-module-state": "error" },
			}),
		)
		mkdirSync(join(file, ".."), { recursive: true })
		writeFileSync(file, code)
		const testFile = join(dir, "src/shared/state.test.ts")
		writeFileSync(testFile, "let n = 0;\n")
		visit(file, code)
		visit(testFile, "let n = 0;\n")
		return lintVerdict({ dir, rule: "no-module-state" })
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

function visit(filename: string, code: string): void {
	const parsed = parseSync(filename, code)
	const visitors = rule.create({
		filename,
		report() {},
		sourceCode: {
			getText: () => code,
			getAllComments: () => parsed.comments,
			getCommentsBefore(node: { start: number }) {
				return parsed.comments.filter((comment) => code.slice(comment.end, node.start).trim() === "")
			},
		},
	})
	walk(parsed.program, null, visitors)
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

it("no-module-state", () => {
	const offender = lint("// nope\nlet n = 0;\n")
	const clean = lint(
		"const n = 1;\nfunction inner() {\n\tlet hidden = 1;\n\treturn hidden;\n}\n// per-process-constant: build id\nlet build = 1;\n",
	)
	expect(offender).toBe(1)
	expect(clean).toBe(0)
})
