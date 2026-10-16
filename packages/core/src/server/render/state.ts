import type { Located } from "../../shared/route-builder/index.ts"
import { escapeAttr, escapeInlineScript } from "./escape.ts"

export type StateMatch = {
	id: string
	params: Located["params"]
	search: Located["search"]
	data: unknown
	preloader: unknown
	head: unknown
	error: unknown
	// This route's head replaces the merged head, so the client merge replaces too (dx/head.md).
	replace?: true
}

// `build` is the deploy's id, the one `flare-build` carries. `at` is when the loaders' data was rendered: a stored or
// CDN copy replays it, so the client's cache knows the document's age (BUGS.md 139). `fill` marks a render that left a
// stored `"stream"` hole: the client sends one fill after hydrate.
type State = { matches: readonly StateMatch[]; nonce: string; build: string; at: number; fill?: boolean | undefined }

export function stateScript(state: State): string {
	return script(payload(state), state.nonce)
}

// The document's state in two steps: the matches serialize now, so a value JSON cannot hold fails before the shell,
// and the request's query cache joins after the shell rendered, so the queries it resolved are in it (B83). No query
// getter is `"queries":null`. A cache JSON cannot hold is a bug that names the query, and `null`, so the document still
// completes and the client fetches that query itself. `head` is the final shell's `<head>` sequence (B120).
export function stateWriter(
	state: State,
): (queries: unknown, onBug: (bug: Error) => void, head: readonly string[]) => string {
	const base = payload(state)
	return (queries, onBug, head) =>
		script(`${base.slice(0, -1)},"queries":${queriesJson(queries, onBug)},"head":${JSON.stringify(head)}}`, state.nonce)
}

function queriesJson(queries: unknown, onBug: (bug: Error) => void): string {
	try {
		return JSON.stringify(queries ?? null)
	} catch (cause) {
		const hash = failingQuery(queries)
		const what = hash === undefined ? "the query cache" : `the query ${hash}`
		onBug(new Error(`${what} does not serialize into the document state`, { cause }))
		return "null"
	}
}

// The first dehydrated query JSON cannot hold, by its hash. A cache with no such list names none.
function failingQuery(queries: unknown): string | undefined {
	const list: unknown = Reflect.get(Object(queries), "queries")
	const found = (Array.isArray(list) ? list : []).find((query: unknown) => {
		try {
			JSON.stringify(query)
			return false
		} catch {
			return true
		}
	})
	return found === undefined ? undefined : String(Reflect.get(Object(found), "queryHash"))
}

function payload(state: State): string {
	const fill = state.fill === true ? { fill: true } : {}
	return JSON.stringify({ matches: state.matches, nonce: state.nonce, build: state.build, at: state.at, ...fill })
}

// A string CSP has no nonce, and then the tag has no attribute (B68).
function script(json: string, nonce: string): string {
	const attr = nonce === "" ? "" : ` nonce="${escapeAttr(nonce)}"`
	return `<script${attr}>self.flare=${escapeInlineScript(json)}</script>`
}

// Before `</body>`. A root that renders no body, such as one that renders only text, gets it at the end.
export function insertState(shell: string, script: string): string {
	const close = shell.lastIndexOf("</body>")
	if (close === -1) return `${shell}${script}`
	return `${shell.slice(0, close)}${script}${shell.slice(close)}`
}
