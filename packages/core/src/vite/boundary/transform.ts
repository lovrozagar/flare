import MagicString from "magic-string"
import { parseSync, type Program } from "oxc-parser"
import { langOf, fnId, serverFnsOf } from "../route-meta/index.ts"
import { envEdits, type Graph } from "./env.ts"
import type { HelperSources } from "./env-names.ts"
import { pruneImports, splitEdits, type Edit, type Split } from "./split.ts"

// The boundary transform of one module in one graph: one parse and one MagicString. The client graph splits route
// chains and server function bodies (B8). Every graph rewrites the env helpers (B9) and writes each
// server function's `__id` and `__name`, plus `__client: true` in the client graph (B41). An import only
// removed code read is then dropped, in both graphs. Undefined when nothing changed. `sources` names the helpers the
// module's imports bring through the app's barrels (BUGS.md 461).
export function boundaryTransform(
	file: string,
	source: string,
	at: { graph: Graph; sources?: HelperSources },
): Split | undefined {
	const graph = at.graph
	const parsed = parseSync(file, source, { sourceType: "module", lang: langOf(file) })
	const [error] = parsed.errors
	if (error !== undefined) throw new Error(`${file}: ${error.message}`)
	const program = parsed.program
	const edit: Edit = { file, source, out: new MagicString(source), removed: [] }
	if (graph === "client") splitEdits(edit, program)
	const sources = at.sources ?? new Map()
	edit.removed.push(...envEdits({ file, program, graph, out: edit.out, skip: [...edit.removed], sources }))
	injectIds(edit, program, graph)
	if (!edit.out.hasChanged()) return undefined
	if (edit.removed.length > 0) pruneImports(edit, program)
	return { code: edit.out.toString(), map: edit.out.generateMap({ hires: true, source: file, includeContent: true }) }
}

// The fields go into the config literal, or form one when the call has none. A trailing comma is kept valid.
function injectIds(edit: Edit, program: Program, graph: Graph): void {
	for (const record of serverFnsOf(edit.file, program)) {
		const fields = [`__id: ${JSON.stringify(fnId(edit.file, record.name))}`, `__name: ${JSON.stringify(record.name)}`]
		if (graph === "client") fields.push("__client: true")
		const { start, end, literal, after } = record.config
		if (start === end) {
			edit.out.appendLeft(start, `{ ${fields.join(", ")} }`)
			continue
		}
		if (after === undefined || typeof literal !== "object" || literal === null || Array.isArray(literal)) {
			throw new Error(`${edit.file}: ${record.name} createServerFn() takes a literal object`)
		}
		// Written right after the last property, so a comment after it cannot swallow them, or inside an empty `{}`.
		if (after !== start + 1) edit.out.appendLeft(after, `, ${fields.join(", ")}`)
		else edit.out.appendLeft(after, ` ${fields.join(", ")}${edit.source[after] === "}" ? " " : ""}`)
	}
}
