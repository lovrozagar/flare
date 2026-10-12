import { escapeAttr, escapeInlineScript } from "../render/escape.ts";

// What a stored body holds in place of the request nonce (B68). A hit puts its own nonce back.
export const NONCE_SENTINEL = "__FLARE_NONCE__";

// A `nonce` attribute, double- or single-quoted, preceded by one whitespace character so `data-nonce` is not one.
const ATTRIBUTE = /\snonce=(?:"[^"]*"|'[^']*')/g;

// " nonce=" is seven characters, then the quote, the value, and the closing quote.
const VALUE_AT = 8;

// The payload of the one state script, `self.flare=<json>` (server/render/state.ts).
const STATE = /(?<=>self\.flare=).*?(?=<\/script>)/s;

// Each nonce attribute, rewritten from its value. `next` returns the new value, or `undefined` to keep it, or ""
// to drop the attribute.
function attributes(body: string, next: (value: string) => string | undefined): string {
	return body.replaceAll(ATTRIBUTE, (whole: string) => {
		const value = next(whole.slice(VALUE_AT, -1));
		if (value === undefined) return whole;
		if (value === "") return "";
		const quote = whole.charAt(VALUE_AT - 1);
		return `${whole.charAt(0)}nonce=${quote}${escapeAttr(value)}${quote}`;
	});
}

// The write replaces nonce attributes equal to the request nonce, and the state's `nonce` field, with the
// sentinel. Text that equals the nonce, and loader data that holds it, stay as they are (dx/server.md).
export function toSentinel(body: string, nonce: string): string {
	const rewritten = attributes(body, (value) => (value === nonce ? NONCE_SENTINEL : undefined));
	return withStateNonce(rewritten, NONCE_SENTINEL);
}

// A hit writes its own nonce over the sentinel. With no nonce, a string or `false` CSP, the attributes go and the
// state field is "" (B68).
export function fromSentinel(body: string, nonce: string): string {
	const rewritten = attributes(body, (value) => (value === NONCE_SENTINEL ? nonce : undefined));
	return withStateNonce(rewritten, nonce);
}

// The state payload is JSON escaped for an inline script. Parsing and writing it back with the same escape changes
// only its own `nonce` field.
function withStateNonce(body: string, nonce: string): string {
	return body.replace(STATE, (payload: string) =>
		escapeInlineScript(JSON.stringify(Object.assign(JSON.parse(payload), { nonce }))),
	);
}
