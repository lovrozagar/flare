import { createMemo, Loading } from "solid-js";
import { createPage, useDeferred } from "@lovrozagar/flare";

function after(ms: number, value: string): Promise<string> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// The inner boundary waits on a value derived from the outer one, so the stored shell must hold both resolved.
function Inner(props: { value: string }) {
	const inner = createMemo(async () => `${props.value}!`);
	return <Loading fallback="wait-inner">{inner()}</Loading>;
}

// A stored page: its "resolve" value settles before the shell, under two nested <Loading> boundaries (bits/10).
export const route = createPage("_root_/stored")
	.cache({ isr: true })
	.loader(({ defer }) => ({ value: defer(() => after(50, "STORED-VALUE")) }))
	.render((props) => {
		const outer = useDeferred(() => props.loaderData.value);
		return (
			<p id="stored">
				<Loading fallback="wait-outer">
					<Inner value={outer()} />
				</Loading>
			</p>
		);
	});
