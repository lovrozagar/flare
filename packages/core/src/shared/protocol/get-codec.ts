import { BUILD_PARAM, INPUT_PARAM } from "./constants.ts"

// A GET server function carries its input as `?_i=<JSON>`, at most 8,192 encoded characters (dx/server-fn.md).
export const MAX_GET_INPUT = 8192

// The client refuses before sending, so a request never reaches the server over the cap.
// A void input has no JSON form: the caller omits `_i`, and the server reads `undefined`.
export function encodeGetInput(input: unknown): string {
	if (input === undefined) throw new Error("A void GET input has no _i value. Omit _i")
	const encoded = encodeURIComponent(JSON.stringify(input))
	if (encoded.length > MAX_GET_INPUT) throw new Error(`The GET input is ${encoded.length} characters. The cap is 8192`)
	return encoded
}

// A GET call's query: `_i` unless the input is void, then `_b`, the client's build, unless it has none (dev).
export function getQuery(input: unknown, build: string): string {
	const pairs: string[] = []
	if (input !== undefined) pairs.push(`${INPUT_PARAM}=${encodeGetInput(input)}`)
	if (build !== "") pairs.push(`${BUILD_PARAM}=${encodeURIComponent(build)}`)
	return pairs.length === 0 ? "" : `?${pairs.join("&")}`
}

// No `_i` is input `undefined`. `_b` is read for its shape alone. Any other param, a second `_i` or `_b`, a value over
// the cap, or JSON that does not parse is 400.
export function decodeGetInput(search: string): { status: 200; input: unknown } | { status: 400 } {
	const params = new Map<string, string>()
	for (const pair of search.replace(/^\?/, "").split("&")) {
		if (pair === "") continue
		const at = pair.indexOf("=")
		const key = pair.slice(0, at)
		if (at === -1 || (key !== INPUT_PARAM && key !== BUILD_PARAM) || params.has(key)) return { status: 400 }
		params.set(key, pair.slice(at + 1))
	}
	const raw = params.get(INPUT_PARAM)
	if (raw === undefined) return { status: 200, input: undefined }
	if (raw.length > MAX_GET_INPUT) return { status: 400 }
	try {
		return { status: 200, input: JSON.parse(decodeURIComponent(raw)) }
	} catch {
		return { status: 400 }
	}
}
