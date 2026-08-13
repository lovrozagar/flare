import { parseSync } from "oxc-parser"
import type { Program } from "oxc-parser"

export interface ParseResult {
	program: Program
	comments: Array<{ type: "Line" | "Block"; value: string; start: number; end: number }>
	diagnostics: Array<{ message: string; start: number; end: number; severity: "error" | "warning" | "advice" }>
}

export function parseSource(source: string, filename = "input.tsx"): ParseResult {
	const result = parseSync(filename, source, { lang: "tsx", preserveParens: false })
	return {
		comments: result.comments,
		diagnostics: result.errors.map((e) => ({
			end: (e.labels[0] as { end?: number } | undefined)?.end ?? 0,
			message: e.message,
			severity: e.severity.toLowerCase() as "error" | "warning" | "advice",
			start: (e.labels[0] as { start?: number } | undefined)?.start ?? 0,
		})),
		program: result.program,
	}
}
