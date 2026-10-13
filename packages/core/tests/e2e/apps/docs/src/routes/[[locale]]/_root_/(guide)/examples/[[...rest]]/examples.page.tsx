import { createPage, useSearch } from "@lovrozagar/flare";
import { serverCtx } from "@lovrozagar/flare/server";
import type { JSX } from "@solidjs/web";
import { Actions, TABS, Tabs, type Tab } from "../../../../../../components/example-links.tsx";

const ID = "[[locale]]/_root_/(guide)/examples/[[...rest]]";

function tabOf(raw: Record<string, string | string[]>): { tab?: Tab; note?: string } {
	const tab = TABS.find((name) => name === raw["tab"]);
	const note = raw["note"];
	return { ...(tab === undefined ? {} : { tab }), ...(typeof note === "string" ? { note } : {}) };
}

function Fact(props: { label: string; id: string; value: string }): JSX.Element {
	return (
		<>
			<dt class="text-stone-500">{props.label}</dt>
			<dd id={props.id} class="font-mono">
				{props.value}
			</dd>
		</>
	);
}

// `/examples`, `/examples/a`, and `/examples/a/b` are one page: the optional catch-all is undefined at the root.
// A revisit inside 30 s reuses the client copy and sends no data request. `shouldRefetch` lets a revalidation
// through, and `loaderDeps` reruns the loader when the tab changes on a stay.
export const route = createPage(ID)
	.cache({ client: { staleTime: "30s", gcTime: "2m", prefetchStaleTime: "10s" } })
	.input({ searchParams: tabOf })
	.effects({
		loaderDeps: (ctx) => [ctx.search["tab"]],
		shouldRefetch: (ctx) => ctx.trigger === "revalidation",
	})
	.loader(({ params, search }) => ({
		rest: params.rest ?? null,
		tab: search.tab ?? "routes",
		requestId: serverCtx().requestId,
	}))
	.render((props) => {
		const search = useSearch({ from: ID });
		return (
			<div>
				<h1 class="text-3xl font-semibold tracking-tight">Examples</h1>
				<dl class="mt-6 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
					<Fact label="rest" id="examples-rest" value={JSON.stringify(props.loaderData.rest)} />
					<Fact label="tab (loader)" id="examples-tab" value={props.loaderData.tab} />
					<Fact label="tab (useSearch)" id="examples-search-tab" value={search.tab ?? "routes"} />
					<Fact label="note" id="examples-note" value={search.note ?? "-"} />
					<Fact label="request" id="examples-request" value={props.loaderData.requestId} />
				</dl>
				<Tabs locale={props.params.locale} rest={props.params.rest} tab={props.search.tab} />
				<Actions locale={props.params.locale} rest={props.params.rest} tab={props.search.tab} />
			</div>
		);
	});
