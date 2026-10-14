import { createPage, Link, notFound } from "@lovrozagar/flare";
import { serverCtx } from "@lovrozagar/flare/server";
import { For } from "solid-js";
import { apiEntries, apiEntryOf } from "../../../../../../api-reference.ts";
import { CodeBlock } from "../../../../../../components/code-block.tsx";

// A shared live render: the store keeps it for ten minutes under the `api` tag, and the admin's republish purges it.
// The segment above sets the CDN header. A path with no entry throws `notFound()`: a 404 with the page's own
// not-found render (BUGS.md 105).
export const route = createPage("[[locale]]/_root_/(guide)/api/[...path]")
	.cache({ ssr: { ttl: "10m", staleTime: "5m", tags: ["api"] } })
	.loader(({ params }) => {
		const entry = apiEntryOf(params.path) ?? notFound();
		return { entry, renderedBy: serverCtx().requestId, renderedAt: new Date().toISOString() };
	})
	.head((ctx) => ({ title: `${ctx.loaderData.entry.name} — API — Flare docs` }))
	.render((props) => (
		<div>
			<p class="text-sm text-flame-600 dark:text-flame-400">API reference</p>
			<h1 id="api-name" class="mt-1 font-mono text-3xl font-semibold">
				{props.loaderData.entry.name}
			</h1>
			<p class="mt-2 text-sm text-stone-500">
				from <code>{props.loaderData.entry.from}</code>
			</p>
			<div class="mt-6">
				<CodeBlock code={props.loaderData.entry.signature} />
			</div>
			<p class="mt-4 text-stone-700 dark:text-stone-300">{props.loaderData.entry.note}</p>
			<p class="mt-6 text-xs text-stone-500">
				rendered by <code id="api-rendered-by">{props.loaderData.renderedBy}</code> at{" "}
				<code id="api-rendered-at">{props.loaderData.renderedAt}</code>
			</p>
			<ul class="mt-8 grid gap-2 sm:grid-cols-2">
				<For each={apiEntries}>
					{(entry) => (
						<li>
							<Link
								to="[[locale]]/_root_/(guide)/api/[...path]"
								params={{ locale: props.params.locale, path: entry.path.split("/") }}
								class="block rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm hover:border-flame-400 dark:border-ink-800"
								activeClass="border-flame-500"
							>
								{entry.name}
							</Link>
						</li>
					)}
				</For>
			</ul>
		</div>
	))
	.notFoundRender((props) => (
		<h1 id="api-unknown" class="mt-1 text-3xl font-semibold">
			No entry at /{[props.params.path].flat().join("/")}
		</h1>
	));
