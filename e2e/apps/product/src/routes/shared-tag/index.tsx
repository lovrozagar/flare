import { createPage } from "@lovrozagar/flare/page";

let callCount = 0;

export const route = createPage("_root_/(shared-tag)/shared-tag")
	.cache({ ssr: { staleTime: 5_000, tags: ["shared-tag", "stag-page"], ttl: 60 } })
	.loader(() => {
		callCount++;
		return { callCount, timestamp: Date.now() };
	})
	.render((props) => (
		<div data-testid="shared-tag-page">
			<p data-testid="stag-page-ts">{props.loaderData.timestamp}</p>
			<p data-testid="stag-page-calls">{props.loaderData.callCount}</p>
		</div>
	));
