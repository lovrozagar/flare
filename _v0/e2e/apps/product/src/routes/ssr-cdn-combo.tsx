import { createPage } from "@lovrozagar/flare/page";

let callCount = 0;

export const route = createPage("_root_/ssr-cdn-combo")
	.cache({
		cdn: { maxAge: 600, swr: 120, tags: ["combo-cdn", "combo-shared"] },
		ssr: { staleTime: 5_000, tags: ["combo-ssr", "combo-shared"], ttl: 60 },
	})
	.loader(() => {
		callCount++;
		return { callCount, timestamp: Date.now() };
	})
	.render((props) => (
		<div data-testid="ssr-cdn-combo">
			<p data-testid="combo-timestamp">{props.loaderData.timestamp}</p>
			<p data-testid="combo-calls">{props.loaderData.callCount}</p>
		</div>
	));
