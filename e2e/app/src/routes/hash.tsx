import { createPage } from "flare/page"

export const route = createPage("_root_/hash")
	.loader(async (ctx) => {
		const input = String(ctx.location.search.input ?? "hello")
		const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
		const hashHex = Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
		return { hash: hashHex, input }
	})
	.render((props) => (
		<main data-testid="hash">
			<p data-testid="hash-input">{props.loaderData.input}</p>
			<p data-testid="hash-value">{props.loaderData.hash}</p>
		</main>
	))
