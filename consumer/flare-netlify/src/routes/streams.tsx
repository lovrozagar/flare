import { createPage } from "flare/page"

export const route = createPage("_root_/streams")
	.loader(async () => {
		/* Create a ReadableStream, read all chunks, concatenate */
		const chunks = ["Hello", " from ", "streams"]
		const stream = new ReadableStream<string>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(chunk)
				}
				controller.close()
			},
		})

		const reader = stream.getReader()
		let result = ""
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			result += value
		}

		/* Test TextEncoder stream round-trip */
		const encoder = new TextEncoder()
		const encoded = encoder.encode(result)
		const decoder = new TextDecoder()
		const decoded = decoder.decode(encoded)

		/* Test Response construction from string */
		const response = new Response("test-body", {
			headers: { "x-test": "true" },
			status: 200,
		})
		const responseBody = await response.text()
		const responseHeader = response.headers.get("x-test")

		return {
			decoded,
			decodedMatch: decoded === result,
			platform: "Netlify",
			responseBody,
			responseHeader: responseHeader ?? "missing",
			streamResult: result,
		}
	})
	.render((props) => (
		<div>
			<h1 data-testid="streams-heading">Streams — Netlify</h1>
			<dl>
				<dt>Stream Result</dt>
				<dd data-testid="streams-result">{props.loaderData.streamResult}</dd>
				<dt>Decoded Match</dt>
				<dd data-testid="streams-match">{String(props.loaderData.decodedMatch)}</dd>
				<dt>Response Body</dt>
				<dd data-testid="streams-response-body">{props.loaderData.responseBody}</dd>
				<dt>Response Header</dt>
				<dd data-testid="streams-response-header">{props.loaderData.responseHeader}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
