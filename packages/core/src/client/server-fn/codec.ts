import { encodeGetInput, fnPrefix, INPUT_PARAM } from "../../shared/protocol/index.ts"

// What a client call sends (dx/server-fn.md), to `<basePath>/_flare/fn/<id>` (B41). GET carries the input as `_i` alone, and a void input omits it. POST
// sends the JSON body, and a void input sends none: the server reads undefined either way. The GET encoder throws
// past 8,192 characters, before anything is sent (B43).
export function fnRequest(
	fn: { id: string; record: { method: "get" | "post" } },
	input: unknown,
	basePath: string,
): { url: string; init: RequestInit } {
	const url = `${fnPrefix(basePath)}${fn.id}`
	if (fn.record.method === "get") {
		const query = input === undefined ? "" : `?${INPUT_PARAM}=${encodeGetInput(input)}`
		return { url: `${url}${query}`, init: { method: "GET" } }
	}
	if (input === undefined) return { url, init: { method: "POST" } }
	return {
		url,
		init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) },
	}
}
