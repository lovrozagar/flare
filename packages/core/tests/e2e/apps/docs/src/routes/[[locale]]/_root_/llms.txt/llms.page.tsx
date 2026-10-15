import { createPage } from "@lovrozagar/flare"
import { docs } from "../../../../content.ts"

// A `.response()` page renders nothing. It answers with its own Response, and a Link to it is a full document load.
export const route = createPage("[[locale]]/_root_/llms.txt").response(
	() =>
		new Response(
			[
				"# Flare docs",
				"",
				...docs.map((doc) => `- [${doc.title}](https://flare.test/docs/${doc.slug}): ${doc.summary}`),
			].join("\n"),
			{ headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } },
		),
)
