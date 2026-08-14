import { createPage } from "flare/page"

export const route = createPage("_root_/custom-headers")
	.loader(() => ({
		content: "Page with custom headers",
		timestamp: Date.now(),
	}))
	.headers(({ loaderData }) => ({
		"x-custom-data": `ts-${(loaderData as { timestamp: number }).timestamp}`,
		"x-custom-header": "flare-test-value",
		"x-powered-by": "flare-e2e",
	}))
	.render((props) => (
		<div data-testid="custom-headers">
			<p data-testid="custom-headers-content">{props.loaderData.content}</p>
			<p data-testid="custom-headers-timestamp">{props.loaderData.timestamp}</p>
		</div>
	))
