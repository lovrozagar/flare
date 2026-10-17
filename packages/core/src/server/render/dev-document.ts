import { isTabToken, mintTab, TAB_HEADER, tabMeta } from "../../shared/protocol/index.ts"
import { carryMark } from "../lifecycle/finalize.ts"
import { escapeAttr } from "./escape.ts"

// The request nonce, read from the policy the app answered with. Vite's client reads it from a `csp-nonce` meta for
// the styles it injects and its error overlay, so a nonce CSP does not block them.
const POLICY_NONCE = /'nonce-([A-Za-z0-9+/=_-]+)'/

const HEAD_CLOSE = "</head>"

// `head` is devHead, what `transformIndexHtml` adds to an empty document. `token` is the request's dev tab token.
export type DevTags = { head: string; token: string }

// The request's dev tab token: the one its tab sent, or a fresh one for a document (B42).
export function devToken(request: Request): string {
	const sent = request.headers.get(TAB_HEADER)
	return sent !== null && isTabToken(sent) ? sent : mintTab()
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

// The tags go in before the first `</head>`, found across chunks; a document with no head gets them in front. Every
// chunk goes through one decoder, so a character split across chunks arrives whole (BUGS.md B8).
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
				const close = pending.indexOf(HEAD_CLOSE)
				if (close === -1) return
				controller.enqueue(encoder.encode(`${pending.slice(0, close)}${tags}${pending.slice(close)}`))
				pending = ""
				written = true
			},
			flush(controller) {
				const rest = `${pending}${decoder.decode()}`
				const out = written ? rest : `${tags}${rest}`
				if (out !== "") controller.enqueue(encoder.encode(out))
			},
		}),
	)
}
