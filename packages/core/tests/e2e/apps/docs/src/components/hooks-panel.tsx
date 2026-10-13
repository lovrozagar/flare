import {
	useLoaderData,
	useLocation,
	useMatch,
	useNavigation,
	useParams,
	usePreloaderContext,
	useSearch,
} from "@lovrozagar/flare";
import type { JSX } from "@solidjs/web";

const PAGE = "[[locale]]/_root_/(guide)/docs/[slug]";

function Row(props: { name: string; id: string; value: string }): JSX.Element {
	return (
		<div class="flex gap-3 py-1">
			<dt class="w-44 shrink-0 font-mono text-stone-500">{props.name}</dt>
			<dd id={props.id} class="min-w-0 break-all font-mono text-stone-800 dark:text-stone-200">
				{props.value}
			</dd>
		</div>
	);
}

// Every data hook, read live on the doc page. Each level's preloader context shows what that level sees.
export function HooksPanel(): JSX.Element {
	const params = useParams({ from: PAGE });
	const search = useSearch({ from: PAGE });
	const location = useLocation();
	const match = useMatch({ from: PAGE });
	const navigation = useNavigation();
	const docsData = useLoaderData({ from: "[[locale]]/_root_/(guide)/docs" });
	const root = usePreloaderContext({ from: "[[locale]]/_root_" });
	const guide = usePreloaderContext({ from: "[[locale]]/_root_/(guide)" });
	const page = usePreloaderContext({ from: PAGE });
	return (
		<details class="mt-10 rounded-xl border border-stone-200 p-4 text-xs dark:border-ink-800" open>
			<summary class="cursor-pointer text-sm font-medium">Live hooks</summary>
			<dl class="mt-3">
				<Row name="useParams" id="hook-params" value={JSON.stringify(params)} />
				<Row name="useSearch" id="hook-search" value={JSON.stringify(search)} />
				<Row name="useLocation" id="hook-location" value={location.pathname + location.hash} />
				<Row name="useMatch" id="hook-match" value={`${match.routeId} ${match.id}`} />
				<Row name="useNavigation" id="hook-pending" value={String(navigation.pending)} />
				<Row name="useLoaderData(docs)" id="hook-docs-data" value={JSON.stringify(docsData.stats)} />
				<Row name="preloader (root)" id="ctx-root" value={JSON.stringify(root)} />
				<Row name="preloader (guide)" id="ctx-guide" value={JSON.stringify(guide)} />
				<Row name="preloader (page)" id="ctx-page" value={JSON.stringify(page)} />
			</dl>
		</details>
	);
}
