import { escapeAttr, escapeInlineScript } from "../render/escape.ts"

// What a stored body holds in place of the request nonce (B68): a prefix and 16 random bytes in hex, made at each
// write and recorded in the entry. Stored markup cannot hold it, because it is made after the render's inputs exist,
// so a planted `nonce="__FLARE_NONCE__"` or another entry's sentinel is never granted a hit's nonce.
const PREFIX = "__FLARE_NONCE_"

export function newSentinel(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	return PREFIX + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

// A start tag, its attributes walked in order: a name, then a quoted or bare value, or none.
const TAG = /<[a-zA-Z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g
const ATTRIBUTE = /(\s+)([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g

// The state script's opening, `<script id="flare-state"` and its nonce, then `self.flare=` (server/render/state.ts).
const STATE_OPEN = /<script id="flare-state"(?: nonce="[^"]*")?>self\.flare=/g

// Each tag's own `nonce` attribute, rewritten from its quoted value. Text, or another attribute's value, that spells
// one is not one (BUGS.md 332). `next` returns the new value, or `undefined` to keep it, or "" to drop the attribute.
function attributes(body: string, next: (value: string) => string | undefined): string {
	return body.replaceAll(TAG, (tag: string) =>
		tag.replaceAll(ATTRIBUTE, (whole: string, ...groups: (string | undefined)[]) => {
			const [space, name, quoted] = groups
			if (name !== "nonce" || quoted === undefined || !/^["']/.test(quoted)) return whole
			const value = next(quoted.slice(1, -1))
			if (value === undefined) return whole
			if (value === "") return ""
			return `${String(space)}nonce=${quoted.charAt(0)}${escapeAttr(value)}${quoted.charAt(0)}`
		}),
	)
}

// The write replaces nonce attributes equal to the request nonce, and the state's `nonce` field, with the entry's
// sentinel. Text that equals the nonce, and loader data that holds it, stay as they are (dx/server.md).
export function toSentinel(body: string, nonce: string, sentinel: string): string {
	const rewritten = attributes(body, (value) => (value === nonce ? sentinel : undefined))
	return withStateNonce(rewritten, { from: nonce, to: sentinel })
}

// A nonce an attribute and the state's JSON both hold as written, as the server's own hex nonce is.
const PLAIN = /^[\w+/=-]+$/

// A hit writes its own nonce over the sentinel. The sentinel was made after the render, so it stands only where the
// write put it, in nonce attributes and the state's field: a plain nonce goes over every one in a single pass, with no
// pattern walk and no parse of the state, the cost a hit paid on each request (plan 21 15.2). With no nonce, a string
// or `false` CSP, the attributes go and the state field is "" (B68).
export function fromSentinel(body: string, sentinel: string, nonce: string): string {
	if (PLAIN.test(nonce)) return body.replaceAll(sentinel, nonce)
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
