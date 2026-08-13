import { createPage } from "flare/page"

export const route = createPage("_root_/hash")
	.loader(async (ctx) => {
		const input = String(ctx.location.search.input ?? "hello")
		const encoder = new TextEncoder()
		const data = encoder.encode(input)
		const hashBuffer = await crypto.subtle.digest("SHA-256", data)
		const hashArray = Array.from(new Uint8Array(hashBuffer))
		const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
		return {
			hash: hashHex,
			input,
			platform: "Bun",
		}
	})
	.render((props) => (
		<div>
			<h1 data-testid="hash-heading">Hash — Bun</h1>
			<dl>
				<dt>Input</dt>
				<dd data-testid="hash-input">{props.loaderData.input}</dd>
				<dt>SHA-256</dt>
				<dd data-testid="hash-value">{props.loaderData.hash}</dd>
				<dt>Platform</dt>
				<dd data-testid="hash-platform">{props.loaderData.platform}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
