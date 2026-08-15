import { createPage } from "@lovrozagar/flare/page";

let callCount = 0;

export const route = createPage("_root_/kv-cache-test")
	.cache({
		ssr: { staleTime: 5_000, tags: ["kv-test"], ttl: 60 },
	})
	.loader(() => {
		callCount++;
		return { callCount, timestamp: Date.now() };
	})
	.render((props) => (
		<main data-testid="kv-cache-test">
			<p data-testid="kv-timestamp">{props.loaderData.timestamp}</p>
			<p data-testid="kv-call-count">{props.loaderData.callCount}</p>
		</main>
	));
