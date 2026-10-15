import { createPage } from "@lovrozagar/flare"

// `[_]flare]` is the static segment `[flare]`, not a param (dx/routes.md Brackets).
export const route = createPage("[[locale]]/_root_/[_]flare]")
	.head(() => ({ title: "[flare] — Flare docs" }))
	.render(() => (
		<main class="mx-auto max-w-2xl px-5 py-16">
			<h1 id="literal" class="font-mono text-2xl font-semibold">
				[flare]
			</h1>
			<p class="mt-2 text-stone-500">A folder named with brackets that is a literal segment.</p>
		</main>
	))
