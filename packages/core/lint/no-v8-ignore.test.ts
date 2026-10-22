import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseSync } from "oxc-parser"
import { expect, it } from "vitest"
import { lintVerdict } from "./oxlint.ts"
import plugin from "./no-v8-ignore.js"

const rule = plugin.rules["no-v8-ignore"]

function lint(code: string): 0 | 1 {
	const dir = mkdtempSync(join(tmpdir(), "flare-v8-"))
	const file = join(dir, "src/shared/coverage.ts")
	try {
		writeFileSync(
			join(dir, ".oxlintrc.json"),
			JSON.stringify({
				plugins: [],
				categories: { correctness: "off", suspicious: "off" },
				jsPlugins: [{ name: "flare", specifier: join(import.meta.dirname, "no-v8-ignore.js") }],
				rules: { "flare/no-v8-ignore": "error" },
			}),
		)
		mkdirSync(join(file, ".."), { recursive: true })
		writeFileSync(file, code)
		const parsed = parseSync(file, code)
		const visitors = rule.create({
			filename: file,
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
		return lintVerdict({ dir, rule: "no-v8-ignore" })
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

it("no-v8-ignore", () => {
	const offender = lint("/* v8 ignore next */\nconst n = 1;\nexport const value = n;\n")
	const clean = lint("/* ordinary */\nconst n = 1;\nexport const value = n;\n")
	expect(offender).toBe(1)
	expect(clean).toBe(0)
})
