import { mintTab, sentTab, tabMeta } from "../../shared/protocol/index.ts"
import { carryMark } from "../lifecycle/finalize.ts"
import { escapeAttr } from "./escape.ts"

// The request nonce, read from the policy the app answered with. Vite's client reads it from a `csp-nonce` meta for
// the styles it injects and its error overlay, so a nonce CSP does not block them.
const POLICY_NONCE = /'nonce-([A-Za-z0-9+/=_-]+)'/

// Where the tags go in a document: before the head's close, or the body's open when the head is never closed. Any case
// counts, as an HTML parser reads tags (BUGS.md 412).
const TAG_SPOT = /<\/head\s*>|<body[\s>]/i

// A body that opens as a document. Any other is a fragment, a `.response()` route's say, and takes the tags in front.
const DOCUMENT = /^\s*<(?:!doctype|html)[\s>]/i

// A doctype the tags must follow: before it, the page would render in quirks mode.
const DOCTYPE = /^\s*<!doctype[^>]*>/i

// Whitespace and whole comments at the start of a body.
const LEAD = /^(?:\s|<!--[\s\S]*?-->)*/

// `head` is devHead, what `transformIndexHtml` adds to an empty document. `token` is the request's dev tab token.
export type DevTags = { head: string; token: string }

// The request's dev tab token: the one its tab sent, or a fresh one for a document (B42).
export function devToken(request: Request): string {
	return sentTab(request) ?? mintTab()
}

// A document a dev server serves (B95 (b)): devHead last in `<head>`, then the `csp-nonce` meta with the response's
// own nonce, then the tab meta. It is written here, at the response boundary, after the app and any store answered,
// so a stored body never keeps a tab's token. Every other response passes as it is.
export function devDocument(response: Response, tags: DevTags): Response {
	if (!(response.headers.get("content-type") ?? "").startsWith("text/html") || response.body === null) return response
	const nonce = POLICY_NONCE.exec(response.headers.get("content-security-policy") ?? "")?.[1]
	const meta = nonce === undefined ? "" : `<meta property="csp-nonce" nonce="${escapeAttr(nonce)}">`
	const headers = new Headers(response.headers)
	headers.delete("content-length")
	const body = withTags(response.body, `${tags.head}${meta}${tabMeta(tags.token)}`)
	return carryMark(response, new Response(body, { status: response.status, headers }))
}

// The tags go in before the first `</head>`, found across chunks. A fragment gets them in front at once and is never
// held, and a document with no head gets them after its doctype (BUGS.md 412). Every chunk goes through one decoder,
// so a character split across chunks arrives whole (BUGS.md B8).
function withTags(body: ReadableStream<Uint8Array>, tags: string): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder()
	const encoder = new TextEncoder()
	let pending = ""
	let written = false
	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				const text = decoder.decode(chunk, { stream: true })
				if (written) return void (text === "" || controller.enqueue(encoder.encode(text)))
				pending += text
				const spot = spotOf(pending)
				if (spot === undefined) return
				controller.enqueue(encoder.encode(`${pending.slice(0, spot)}${tags}${pending.slice(spot)}`))
				pending = ""
				written = true
			},
			flush(controller) {
				const rest = `${pending}${decoder.decode()}`
				const lead = leadOf(rest)
				const spot = lead + (DOCTYPE.exec(rest.slice(lead))?.[0].length ?? 0)
				const out = written ? rest : `${rest.slice(0, spot)}${tags}${rest.slice(spot)}`
				if (out !== "") controller.enqueue(encoder.encode(out))
			},
		}),
	)
}

// Where the tags go in what has arrived so far, or undefined while a document has not reached its head's close or its
// body yet, or what has arrived may still open one: whitespace and comments, an unclosed comment, or a cut
// `<!doctype` or `<html` (BUGS.md 412).
function spotOf(text: string): number | undefined {
	const found = TAG_SPOT.exec(text)
	if (found !== null) return found.index
	const rest = text.slice(leadOf(text)).toLowerCase()
	const opening = ["<!--", "<!doctype", "<html"].some((start) => start.startsWith(rest) || rest.startsWith("<!--"))
	if (rest === "" || opening || DOCUMENT.test(rest)) return undefined
	return 0
}

// The length of the whitespace and whole comments a body opens with, which may come before a doctype.
function leadOf(text: string): number {
	return text.length - text.replace(LEAD, "").length
}
