import { createPage, Link, useNavigate, useParams, useSearch } from "@lovrozagar/flare";
import { serverFnQueryOptions, useSuspenseQuery } from "@lovrozagar/flare/query";
import { createSignal, For, Loading } from "solid-js";
import type { JSX } from "@solidjs/web";
import { searchDocs } from "../../../../fns/search.ts";
import { useUi } from "../../../../i18n.ts";

const ID = "[[locale]]/_root_/search";

function queryOf(q: string) {
	return serverFnQueryOptions(searchDocs, { queryKey: ["search", q], input: { q } });
}

function Results(): JSX.Element {
	const ui = useUi();
	const search = useSearch({ from: ID });
	const params = useParams({ from: ID });
	// The loader prefetched this key into the request's client, so hydrate starts with the answer.
	const query = useSuspenseQuery(() => queryOf(search.q));
	return (
		<div>
			<p id="result-count" class="text-sm text-stone-500">
				{ui("results", { count: query.data?.hits.length ?? 0 })}
			</p>
			<ul id="results" class="mt-3 space-y-2">
				<For each={query.data?.hits ?? []}>
					{(hit) => (
						<li>
							<Link
								to="[[locale]]/_root_/(guide)/docs/[slug]"
								params={{ locale: params.locale, slug: hit.slug }}
								class="block rounded-lg border border-stone-200 p-3 hover:border-flame-400 dark:border-ink-800"
							>
								<span class="font-medium">{hit.title}</span>
								<span class="mt-0.5 block text-sm text-stone-500">{hit.summary}</span>
							</Link>
						</li>
					)}
				</For>
			</ul>
		</div>
	);
}

// A client navigation to search from home or a doc opens it as a modal over that page. A reload, or a direct
// visit, renders this page.
export const route = createPage(ID)
	.intercept({ from: ["[[locale]]/_root_/", "[[locale]]/_root_/(guide)/docs/[slug]"], render: "search-modal" })
	.input({
		searchParams: (raw: Record<string, string | string[]>) => ({ q: typeof raw["q"] === "string" ? raw["q"] : "" }),
	})
	.loader(async ({ search, queryClient }) => {
		await queryClient.prefetchQuery(queryOf(search.q));
		return { q: search.q };
	})
	.head((ctx) => ({ title: ctx.search.q === "" ? "Search — Flare docs" : `${ctx.search.q} — Search — Flare docs` }))
	.render((props) => {
		const navigate = useNavigate();
		// A draft the user edits, reset whenever the URL's q changes: back, forward, or another search.
		const [draft, setDraft] = createSignal(() => props.search.q);
		const submit = (event: SubmitEvent): void => {
			event.preventDefault();
			void navigate({
				to: ID,
				params: { locale: props.params.locale },
				search: { q: draft() },
				replace: true,
				state: { from: "search-page" },
			});
		};
		return (
			<main id="search-page" class="mx-auto max-w-2xl px-5 py-10">
				<form onSubmit={submit} class="flex gap-2">
					<input
						id="search-page-input"
						type="search"
						value={draft()}
						onInput={(event) => setDraft(event.currentTarget.value)}
						class="flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 dark:border-ink-800 dark:bg-ink-900"
					/>
					<button type="submit" class="rounded-md bg-flame-500 px-4 text-sm font-medium text-white">
						Search
					</button>
				</form>
				<div class="mt-6">
					<Loading fallback={<p id="search-loading">Searching…</p>}>
						<Results />
					</Loading>
				</div>
			</main>
		);
	});
