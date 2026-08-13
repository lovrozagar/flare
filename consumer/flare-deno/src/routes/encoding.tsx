import { createPage } from "flare/page"

export const route = createPage("_root_/encoding")
	.loader((ctx) => {
		const input = String(ctx.location.search.text ?? "Hello, World! 🌍")

		/* btoa/atob round-trip */
		const base64 = btoa(unescape(encodeURIComponent(input)))
		const decoded = decodeURIComponent(escape(atob(base64)))

		/* TextEncoder/TextDecoder round-trip */
		const encoder = new TextEncoder()
		const encoded = encoder.encode(input)
		const decoder = new TextDecoder()
		const textDecoded = decoder.decode(encoded)

		/* encodeURIComponent round-trip */
		const uriEncoded = encodeURIComponent(input)
		const uriDecoded = decodeURIComponent(uriEncoded)

		return {
			base64,
			byteLength: encoded.byteLength,
			decoded,
			input,
			platform: "Deno",
			roundTripMatch: input === decoded && input === textDecoded && input === uriDecoded,
			textDecoded,
			uriEncoded,
		}
	})
	.render((props) => (
		<div>
			<h1 data-testid="encoding-heading">Encoding — Deno</h1>
			<dl>
				<dt>Input</dt>
				<dd data-testid="encoding-input">{props.loaderData.input}</dd>
				<dt>Base64</dt>
				<dd data-testid="encoding-base64">{props.loaderData.base64}</dd>
				<dt>Decoded</dt>
				<dd data-testid="encoding-decoded">{props.loaderData.decoded}</dd>
				<dt>Byte Length</dt>
				<dd data-testid="encoding-bytes">{String(props.loaderData.byteLength)}</dd>
				<dt>URI Encoded</dt>
				<dd data-testid="encoding-uri">{props.loaderData.uriEncoded}</dd>
				<dt>Round-trip Match</dt>
				<dd data-testid="encoding-match">{String(props.loaderData.roundTripMatch)}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
