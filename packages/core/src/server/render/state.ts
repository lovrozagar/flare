import type { Located } from "../../shared/route-builder/index.ts"
import { registeredQuery } from "../../shared/protocol/index.ts"
import { matchToWire, refusalOf, toWireOrRefused } from "../../shared/protocol/value.ts"
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
// stored `"stream"` hole: the client sends one fill after hydrate. `search` is the query the render saw, none for a
// shared or stored render: the client hydrates on it, then shows its own URL (plan 21 13.8).
type State = {
	matches: readonly StateMatch[]
	nonce: string
	build: string
	at: number
	fill?: boolean | undefined
	search?: string | undefined
}

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
	return JSON.stringify(writableQueries(queries, onBug) ?? null)
}

// The query cache as it can be written, the document state's or a data answer's `q` frame (B83, B134): the cache when
// it is wire-ready, else null and a bug that names the failing query. A query whose data the wire refused dehydrated
// as a Refused (getter.ts); one JSON cannot hold fails the stringify. Undefined, no client, stays undefined.
export function writableQueries(queries: unknown, onBug: (bug: Error) => void): unknown {
	const failure = queryFailure(queries)
	if (failure === undefined) return queries
	const what = failure.hash === undefined ? "the query cache" : `the query ${failure.hash}`
	onBug(new Error(`${what} does not serialize into the answer`, { cause: failure.cause }))
	return null
}

function queryFailure(queries: unknown): { hash: string | undefined; cause: unknown } | undefined {
	for (const query of queryList(queries)) {
		const refused = refusalOf(Reflect.get(Object(Reflect.get(Object(query), "state")), "data"))
		if (refused !== undefined) return { hash: hashOf(query), cause: refused.error }
	}
	try {
		JSON.stringify(queries)
		return undefined
	} catch (cause) {
		return { hash: failingQuery(queries), cause }
	}
}

function queryList(queries: unknown): unknown[] {
	const list: unknown = Reflect.get(Object(queries), "queries")
	return Array.isArray(list) ? list : []
}

function hashOf(query: unknown): string {
	return String(Reflect.get(Object(query), "queryHash"))
}

// The first dehydrated query JSON cannot hold, by its hash. A cache with no such list names none.
function failingQuery(queries: unknown): string | undefined {
	const found = queryList(queries).find((query: unknown) => {
		try {
			JSON.stringify(query)
			return false
		} catch {
			return true
		}
	})
	return found === undefined ? undefined : hashOf(found)
}

// The state script's id (BUGS.md 167).
export const STATE_ID = "flare-state"

function payload(state: State): string {
	const fill = state.fill === true ? { fill: true } : {}
	const search = state.search ? { search: state.search } : {}
	// Each match's app values travel as wire values (B145).
	return JSON.stringify({
		matches: state.matches.map(matchToWire),
		nonce: state.nonce,
		build: state.build,
		at: state.at,
		...fill,
		...search,
	})
}

// A string CSP has no nonce, and then the tag has no attribute (B68). The id marks the state script: the server's
// stored-copy rewrite and the client's boot read the last script with it, which the page's own content, written
// before it, cannot be (BUGS.md 167).
function script(json: string, nonce: string): string {
	const attr = nonce === "" ? "" : ` nonce="${escapeAttr(nonce)}"`
	return `<script id="${STATE_ID}"${attr}>self.flare=${escapeInlineScript(json)}</script>`
}

// Before `</body>`. A root that renders no body, such as one that renders only text, gets it at the end.
export function insertState(shell: string, script: string): string {
	const close = shell.lastIndexOf("</body>")
	if (close === -1) return `${shell}${script}`
	return `${shell.slice(0, close)}${script}${shell.slice(close)}`
}

// The request's query cache for a data answer's `q` frame, once its loaders ran; undefined when the request made no
// client (B134).
export function answerQueries(sink: { log: { error: (tag: string, message: string) => void } }): unknown {
	return writableQueries(registeredQuery()?.dehydrate(toWireOrRefused), (bug) => sink.log.error("queries", bug.message))
}
