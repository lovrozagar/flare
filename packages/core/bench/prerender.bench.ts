import { bench, describe } from "vitest"
import { extractNonce, NONCE_PLACEHOLDER, replaceNonce } from "../src/prerender"

describe("replaceNonce", () => {
	const nonce = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
	const html = `<script nonce="${nonce}">console.log("hello")</script>
<link nonce="${nonce}" rel="stylesheet" href="/style.css">
<script nonce="${nonce}">window.__DATA__={}</script>
<style nonce="${nonce}">.app{color:red}</style>`

	bench("replace 4 nonce occurrences", () => {
		replaceNonce(html, nonce)
	})
})

describe("extractNonce", () => {
	const html = `<!DOCTYPE html><html><head>
<script nonce="${NONCE_PLACEHOLDER}">init()</script>
</head><body></body></html>`

	bench("extract from html", () => {
		extractNonce(html)
	})

	bench("no nonce present", () => {
		extractNonce("<!DOCTYPE html><html><head></head><body></body></html>")
	})
})
