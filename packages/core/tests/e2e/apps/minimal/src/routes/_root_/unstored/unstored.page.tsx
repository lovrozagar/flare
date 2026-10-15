import { Loading } from "solid-js"
import { createPage, useDeferred } from "@lovrozagar/flare"

function after(ms: number, value: string): Promise<string> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

// The /holed page with no cache mode: a live document streams the value, and no fill follows.
export const route = createPage("_root_/unstored")
	.loader(({ defer }) => ({ late: defer(() => after(50, "STREAMED")) }))
	.render((props) => {
		const late = useDeferred(() => props.loaderData.late)
		return (
			<p id="unstored">
				<Loading fallback="wait-stream">{late()}</Loading>
			</p>
		)
	})
