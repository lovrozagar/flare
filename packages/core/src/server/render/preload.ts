import type { RouteChunks } from "../../shared/router/create-router.ts"
import { preloads, type PreloadTable } from "../lifecycle/build-info.ts"
import { escapeAttr } from "./escape.ts"

// The document's modulepreload links: the client entry's modules, then each matched route's, once each, with the
// request's nonce, so the browser fetches the whole chain while it parses the head rather than in waves after the
// entry runs (plan 21 15.3). A route's chunk is its source path in a server build (`chunks`); dev has no table, so it
// writes none.
export function preloadLinks(input: {
	ids: readonly string[]
	chunks: Readonly<Record<string, RouteChunks>>
	nonce: string
	table?: PreloadTable
}): string {
	const table = input.table ?? preloads
	const urls = new Set(table.entry)
	for (const id of input.ids) {
		const chunk = input.chunks[id]
		for (const url of typeof chunk === "string" ? (table.routes[chunk] ?? []) : []) urls.add(url)
	}
	const nonce = input.nonce === "" ? "" : ` nonce="${escapeAttr(input.nonce)}"`
	return [...urls].map((url) => `<link rel="modulepreload" href="${escapeAttr(url)}"${nonce}>`).join("")
}
