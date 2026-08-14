import { createPage } from "flare/page"

export const route = createPage("_root_/encoding")
	.loader((ctx) => {
		const input = String(ctx.location.search.text ?? "Hello, World! 🌍")
		const base64 = btoa(unescape(encodeURIComponent(input)))
		const decoded = decodeURIComponent(escape(atob(base64)))
		const encoded = new TextEncoder().encode(input)
		const textDecoded = new TextDecoder().decode(encoded)
		const uriEncoded = encodeURIComponent(input)
		const uriDecoded = decodeURIComponent(uriEncoded)
		return {
			base64,
			decoded,
			input,
			roundTripMatch: input === decoded && input === textDecoded && input === uriDecoded,
			uriEncoded,
		}
	})
	.render((props) => (
		<main data-testid="encoding">
			<p data-testid="encoding-input">{props.loaderData.input}</p>
			<p data-testid="encoding-decoded">{props.loaderData.decoded}</p>
			<p data-testid="encoding-match">{String(props.loaderData.roundTripMatch)}</p>
		</main>
	))
