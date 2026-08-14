import { createPage } from "flare/page"

export const route = createPage("_root_/streams")
	.loader(async () => {
		const chunks = ["Hello", " from ", "streams"]
		const stream = new ReadableStream<string>({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(chunk)
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
		const response = new Response("test-body", {
			headers: { "x-test": "true" },
			status: 200,
		})
		return {
			responseBody: await response.text(),
			responseHeader: response.headers.get("x-test") ?? "missing",
			streamResult: result,
		}
	})
	.render((props) => (
		<main data-testid="streams">
			<p data-testid="streams-result">{props.loaderData.streamResult}</p>
			<p data-testid="streams-response-body">{props.loaderData.responseBody}</p>
			<p data-testid="streams-response-header">{props.loaderData.responseHeader}</p>
		</main>
	))
