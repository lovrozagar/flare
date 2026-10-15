import { createLayout } from "@lovrozagar/flare"
import { readStats } from "../../../../../stats.ts"

// `/docs/<unknown>/<deeper>` has no page. With `notFoundMode: "fuzzy"` the longest layout prefix, this one,
// paints its own not-found inside the guide chrome.
export const route = createLayout("[[locale]]/_root_/(guide)/docs")
	.preloader(() => ({ section: "docs" }))
	.loader(async () => ({ stats: (await readStats()).stats }))
	.render((props) => props.children)
	.notFoundRender(() => (
		<div
			id="docs-not-found"
			class="rounded-xl border border-dashed border-stone-300 p-10 text-center dark:border-ink-800"
		>
			<h1 class="text-xl font-semibold">No such doc</h1>
			<p class="mt-2 text-sm text-stone-500">Pick a page from the sidebar.</p>
		</div>
	))
