import { fnPrefix, getQuery } from "../../shared/protocol/index.ts"

// What a client call sends (dx/server-fn.md), to `<basePath>/_flare/fn/<id>` (B41). GET carries the input as `_i`,
// and a void input omits it, then the client's build as `_b`, so a cached answer is one build's (plan 21 8.5). POST
// sends the JSON body, and a void input sends none: the server reads undefined either way. The GET encoder throws
// past 8,192 characters, before anything is sent (B43).
export function fnRequest(
	fn: { id: string; record: { method: "get" | "post" } },
	input: unknown,
	where: { basePath: string; build: string },
): { url: string; init: RequestInit } {
	const url = `${fnPrefix(where.basePath)}${fn.id}`
	if (fn.record.method === "get") return { url: `${url}${getQuery(input, where.build)}`, init: { method: "GET" } }
	if (input === undefined) return { url, init: { method: "POST" } }
	return {
		url,
		init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) },
	}
}
