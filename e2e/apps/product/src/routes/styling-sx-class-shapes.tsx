import { createPage } from "flare/page"
import { createSignal } from "solid-js"
import { cn } from "flare/styles"

/* One element per class= shape variant — tests plugin static resolver coverage */
export const route = createPage("_root_/styling-sx-class-shapes").render(() => {
	const [active, setActive] = createSignal(false)

	return (
		<main data-testid="styling-sx-class-shapes">
			{/* static string */}
			<div class="shape-static" data-testid="shape-static">
				static string
			</div>

			{/* array of strings */}
			<div class={["shape-a", "shape-b"]} data-testid="shape-array">
				array
			</div>

			{/* nested array */}
			<div class={["shape-outer", ["shape-inner-a", "shape-inner-b"]]} data-testid="shape-nested-array">
				nested array
			</div>

			{/* cn({...}) call — object composition via explicit cn() */}
			<div class={cn({ "shape-cn-active": true, "shape-cn-inactive": false })} data-testid="shape-cn-object">
				cn object
			</div>

			{/* conditional branch */}
			<button
				data-testid="toggle-active"
				onClick={() => setActive((v) => !v)}
				type="button"
			>
				Toggle
			</button>
			<div
				class={["shape-base", active() && "shape-active"]}
				data-testid="shape-dynamic"
			>
				dynamic conditional
			</div>
		</main>
	)
})
