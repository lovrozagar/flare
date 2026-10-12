import { createMemo, Loading } from "solid-js";
import { createPage } from "@lovrozagar/flare";

function after(ms: number, value: string): Promise<string> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// The deferred value under `key`, as the client and the server both hand it to the render.
function read(data: unknown, key: string): Promise<string> {
	return Reflect.get(Reflect.get(Object(data), key), "promise");
}

// Two deferred reads, each under its own <Loading>: the shell shows both fallbacks, then each fills in turn.
export const route = createPage("_root_/skeletons")
	.loader(({ defer }) => ({ fast: defer(() => after(300, "FAST")), slow: defer(() => after(1200, "SLOW")) }))
	.render((props) => {
		const fast = createMemo(async () => read(props.loaderData, "fast"));
		const slow = createMemo(async () => read(props.loaderData, "slow"));
		return (
			<>
				<p id="fast">
					<Loading fallback="wait-fast">{fast()}</Loading>
				</p>
				<p id="slow">
					<Loading fallback="wait-slow">{slow()}</Loading>
				</p>
			</>
		);
	});
