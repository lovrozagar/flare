import {
	useLoaderData,
	useLocation,
	useMatch,
	useNavigation,
	useParams,
	usePreloaderContext,
	useSearch,
} from "@lovrozagar/flare"
import type { JSX } from "@solidjs/web"
import { createEffect, createSignal } from "solid-js"

const PAGE = "[[locale]]/_root_/(guide)/docs/[slug]"

function Row(props: { name: string; id: string; value: string }): JSX.Element {
	return (
		<div class="flex gap-3 py-1">
			<dt class="w-44 shrink-0 font-mono text-stone-500">{props.name}</dt>
			<dd id={props.id} class="min-w-0 break-all font-mono text-stone-800 dark:text-stone-200">
				{props.value}
			</dd>
		</div>
	)
}

// The last navigation's timing, kept outside the panel: the doc page that holds the panel is replaced when a navigation
// commits, so the panel that saw it start is not the one that sees it end. Only the browser writes it.
const timing = { started: 0, last: "none yet" }

// How long the last navigation stayed pending. `pending` is true from a navigation's fetch until it commits, usually
// too briefly to see, so the panel keeps the last duration.
function lastPending(pending: () => boolean): () => string {
	const [last, setLast] = createSignal(timing.last)
	createEffect(pending, (now) => {
		if (now) timing.started = performance.now()
		else if (timing.started > 0) {
			timing.last = `${Math.round(performance.now() - timing.started)} ms`
			timing.started = 0
			setLast(timing.last)
		}
	})
	return last
}

// Every data hook, read live on the doc page. Each level's preloader context shows what that level sees.
export function HooksPanel(): JSX.Element {
	const params = useParams({ from: PAGE })
	const search = useSearch({ from: PAGE })
	const location = useLocation()
	const match = useMatch({ from: PAGE })
	const navigation = useNavigation()
	const last = lastPending(() => navigation.pending)
	const docsData = useLoaderData({ from: "[[locale]]/_root_/(guide)/docs" })
	const root = usePreloaderContext({ from: "[[locale]]/_root_" })
	const guide = usePreloaderContext({ from: "[[locale]]/_root_/(guide)" })
	const page = usePreloaderContext({ from: PAGE })
	return (
		<details class="mt-10 rounded-xl border border-stone-200 p-4 text-xs dark:border-ink-800" open>
			<summary class="cursor-pointer text-sm font-medium">Live hooks</summary>
			<dl class="mt-3">
				<Row name="useParams" id="hook-params" value={JSON.stringify(params)} />
				<Row name="useSearch" id="hook-search" value={JSON.stringify(search)} />
				<Row name="useLocation" id="hook-location" value={location.pathname + location.hash} />
				<Row name="useMatch" id="hook-match" value={`${match.routeId} ${match.id}`} />
				<div class="flex gap-3 py-1">
					<dt class="w-44 shrink-0 font-mono text-stone-500">useNavigation()</dt>
					<dd class="min-w-0 font-mono text-stone-800 dark:text-stone-200">
						pending: <span id="hook-pending">{String(navigation.pending)}</span>
						<p class="mt-1 font-sans text-stone-500">
							true while a navigation fetches its page, false once it commits. The last navigation was pending for{" "}
							<span id="hook-last-navigation">{last()}</span>.
						</p>
					</dd>
				</div>
				<Row name="useLoaderData(docs)" id="hook-docs-data" value={JSON.stringify(docsData.stats)} />
				<Row name="preloader (root)" id="ctx-root" value={JSON.stringify(root)} />
				<Row name="preloader (guide)" id="ctx-guide" value={JSON.stringify(guide)} />
				<Row name="preloader (page)" id="ctx-page" value={JSON.stringify(page)} />
			</dl>
		</details>
	)
}
