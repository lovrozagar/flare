import { escapeAttr, escapeInlineScript } from "../render/escape.ts"

// What a stored body holds in place of the request nonce (B68): a prefix and 16 random bytes in hex, made at each
// write and recorded in the entry. Stored markup cannot hold it, because it is made after the render's inputs exist,
// so a planted `nonce="__FLARE_NONCE__"` or another entry's sentinel is never granted a hit's nonce.
const PREFIX = "__FLARE_NONCE_"

export function newSentinel(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	return PREFIX + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

// A `nonce` attribute, double- or single-quoted, preceded by one whitespace character so `data-nonce` is not one.
const ATTRIBUTE = /\snonce=(?:"[^"]*"|'[^']*')/g

// " nonce=" is seven characters, then the quote, the value, and the closing quote.
const VALUE_AT = 8

// The state script's opening, `<script id="flare-state"` and its nonce, then `self.flare=` (server/render/state.ts).
const STATE_OPEN = /<script id="flare-state"(?: nonce="[^"]*")?>self\.flare=/g

// Each nonce attribute, rewritten from its value. `next` returns the new value, or `undefined` to keep it, or ""
// to drop the attribute.
function attributes(body: string, next: (value: string) => string | undefined): string {
	return body.replaceAll(ATTRIBUTE, (whole: string) => {
		const value = next(whole.slice(VALUE_AT, -1))
		if (value === undefined) return whole
		if (value === "") return ""
		const quote = whole.charAt(VALUE_AT - 1)
		return `${whole.charAt(0)}nonce=${quote}${escapeAttr(value)}${quote}`
	})
}

// The write replaces nonce attributes equal to the request nonce, and the state's `nonce` field, with the entry's
// sentinel. Text that equals the nonce, and loader data that holds it, stay as they are (dx/server.md).
export function toSentinel(body: string, nonce: string, sentinel: string): string {
	const rewritten = attributes(body, (value) => (value === nonce ? sentinel : undefined))
	return withStateNonce(rewritten, { from: nonce, to: sentinel })
}

// A hit writes its own nonce over the sentinel. With no nonce, a string or `false` CSP, the attributes go and the
// state field is "" (B68).
export function fromSentinel(body: string, sentinel: string, nonce: string): string {
	const rewritten = attributes(body, (value) => (value === sentinel ? nonce : undefined))
	return withStateNonce(rewritten, { from: sentinel, to: nonce })
}

// The state payload is JSON escaped for an inline script. Its own `nonce` field changes only when it holds `from`,
// and writing it back with the same escape leaves the rest as it was.
// Only the last state script is the server's: it follows the page's content, and an earlier one, a head script an app
// gave that id, is left as written (BUGS.md 167).
function withStateNonce(body: string, swap: { from: string; to: string }): string {
	const last = [...body.matchAll(STATE_OPEN)].at(-1)
	if (last === undefined) return body
	const start = last.index + last[0].length
	const end = body.indexOf("</script>", start)
	const state: { nonce?: unknown } = JSON.parse(body.slice(start, end))
	if (state.nonce !== swap.from) return body
	return body.slice(0, start) + escapeInlineScript(JSON.stringify({ ...state, nonce: swap.to })) + body.slice(end)
}
