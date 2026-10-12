import { INPUT_PARAM } from "./constants.ts";

// A GET server function carries its input as `?_i=<JSON>`, at most 8,192 encoded characters (dx/server-fn.md).
export const MAX_GET_INPUT = 8192;

// The client refuses before sending, so a request never reaches the server over the cap.
export function encodeGetInput(input: unknown): string {
	const encoded = encodeURIComponent(JSON.stringify(input));
	if (encoded.length > MAX_GET_INPUT) throw new Error(`The GET input is ${encoded.length} characters. The cap is 8192`);
	return encoded;
}

// No `_i` is input `undefined`. Any other param, a second `_i`, a value over the cap, or JSON that does not parse
// is 400.
export function decodeGetInput(search: string): { status: 200; input: unknown } | { status: 400 } {
	const pairs = search
		.replace(/^\?/, "")
		.split("&")
		.filter((pair) => pair !== "");
	if (pairs.length === 0) return { status: 200, input: undefined };
	const [pair] = pairs;
	if (pairs.length > 1 || !pair.startsWith(`${INPUT_PARAM}=`)) return { status: 400 };
	const raw = pair.slice(INPUT_PARAM.length + 1);
	if (raw.length > MAX_GET_INPUT) return { status: 400 };
	try {
		return { status: 200, input: JSON.parse(decodeURIComponent(raw)) };
	} catch {
		return { status: 400 };
	}
}
