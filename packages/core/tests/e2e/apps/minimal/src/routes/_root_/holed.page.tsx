import { Loading } from "solid-js";
import { createPage, useDeferred } from "@lovrozagar/flare";

function after(ms: number, value: string): Promise<string> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// A stored page whose "stream" value is a hole in the stored body. After hydrate a `_flare=fill` request fills it.
export const route = createPage("_root_/holed")
	.cache({ isr: { defer: "stream" } })
	.loader(({ defer }) => ({ late: defer(() => after(50, "FILLED")) }))
	.render((props) => {
		const late = useDeferred(() => props.loaderData.late);
		return (
			<p id="holed">
				<Loading fallback="wait-hole">{late()}</Loading>
			</p>
		);
	});
