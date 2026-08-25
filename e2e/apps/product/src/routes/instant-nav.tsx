import { createPage } from "@lovrozagar/flare/page";

const ENTER_DELAY_MS = 1_200;

export const route = createPage("_root_/instant-nav")
	.cache({ client: { prefetch: "intent", staleTime: 0 } })
	.loader(async (ctx) => {
		/* Prefetch and SSR stay fast. Enter NDJSON is delayed so the test can
		 * prove click paints the prefetched shell before this hop returns. */
		const isEnterData = ctx.request.headers.get("flare-data") === "1" && !ctx.prefetch;
		if (isEnterData) {
			await new Promise((r) => setTimeout(r, ENTER_DELAY_MS));
		}
		return { title: "Instant shell", ts: Date.now() };
	})
	.head(() => ({ title: "Instant nav" }))
	.render((props) => (
		<main data-testid="instant-nav-page">
			<h1 data-testid="instant-title">{props.loaderData.title}</h1>
			<p data-testid="instant-ts">{props.loaderData.ts}</p>
		</main>
	));
