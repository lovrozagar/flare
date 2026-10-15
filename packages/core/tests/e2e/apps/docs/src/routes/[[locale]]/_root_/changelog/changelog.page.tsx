import { createPage, useDeferred } from "@lovrozagar/flare"
import { serverCtx } from "@lovrozagar/flare/server"
import { Errored, For, Loading } from "solid-js"
import type { JSX } from "@solidjs/web"
import { statsGate } from "../../../../stats-gate.ts"

type Release = { version: string; date: string; note: string }

function after<T>(ms: number, value: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

const RELEASES: readonly Release[] = [
	{ version: "1.0.0", date: "2026-10-13", note: "The v1 core: routes, loaders, server functions, stores." },
	{ version: "0.9.0", date: "2026-09-01", note: "Fonts registry, image optimization, and the sitemap." },
	{ version: "0.8.0", date: "2026-07-20", note: "Cross-tab theme, direction, and locale." },
]

function Skeleton(props: { id: string; lines: number }): JSX.Element {
	return (
		<div id={props.id} class="space-y-2">
			<For each={Array.from({ length: props.lines })}>
				{() => <div class="h-4 animate-pulse rounded bg-stone-200 dark:bg-ink-800" />}
			</For>
		</div>
	)
}

// An ISR page. `latest` resolves before the store writes, so the stored HTML holds it. The other three are
// stream holes: a stored copy has their skeletons, and the client fills them after hydrate. `broken` rejects into
// its own <Errored>, and the rest of the page stays.
export const route = createPage("[[locale]]/_root_/changelog")
	.cache({ isr: { revalidate: "1h", defer: "stream" }, client: { cacheDeferred: true, staleTime: "1m" } })
	.loader(({ defer }) => ({
		// The render's own id, so an e2e case tells one render's copies from a second render (BUGS.md 88).
		renderedBy: serverCtx().requestId,
		latest: defer(() => after(30, RELEASES[0]), { key: "latest", prerender: "resolve" }),
		releases: defer(() => after(150, RELEASES), { key: "releases" }),
		// The e2e can hold `stats` until it has seen the skeleton (stats-gate.ts).
		stats: defer(() => statsGate().then(() => after(900, { downloads: 18_420, contributors: 37 })), { key: "stats" }),
		broken: defer(() => after(300, null).then(() => Promise.reject(new Error("The stats service is down"))), {
			key: "broken",
		}),
	}))
	.head(() => ({ title: "Changelog — Flare docs" }))
	.render((props) => {
		const latest = useDeferred(() => props.loaderData.latest)
		const releases = useDeferred(() => props.loaderData.releases)
		const stats = useDeferred(() => props.loaderData.stats)
		const broken = useDeferred(() => props.loaderData.broken)
		return (
			<main class="mx-auto max-w-3xl px-5 py-10">
				<h1 class="text-3xl font-semibold tracking-tight">Changelog</h1>
				<p class="mt-1 text-xs text-stone-500">
					rendered by <code id="changelog-rendered-by">{props.loaderData.renderedBy}</code>
				</p>
				<Loading fallback={<Skeleton id="latest-loading" lines={1} />}>
					<p id="latest" class="mt-3 text-lg">
						Latest: <strong>{latest()?.version}</strong>
					</p>
				</Loading>
				<div class="mt-8 grid gap-6 md:grid-cols-[1fr_16rem]">
					<Loading fallback={<Skeleton id="releases-loading" lines={6} />}>
						<ol id="releases" class="space-y-4">
							<For each={releases()}>
								{(release) => (
									<li class="rounded-xl border border-stone-200 p-4 dark:border-ink-800">
										<p class="font-mono text-sm text-flame-600 dark:text-flame-400">{release.version}</p>
										<p class="mt-1">{release.note}</p>
										<p class="mt-1 text-xs text-stone-500">{release.date}</p>
									</li>
								)}
							</For>
						</ol>
					</Loading>
					<div class="space-y-4">
						<Loading fallback={<Skeleton id="stats-loading" lines={2} />}>
							<p id="stats" class="rounded-xl bg-stone-100 p-4 text-sm dark:bg-ink-900">
								{stats().downloads.toLocaleString("en")} downloads · {stats().contributors} contributors
							</p>
						</Loading>
						<Errored
							fallback={(error) => (
								<p id="broken-error" class="rounded-xl border border-red-300 p-4 text-sm text-red-600">
									{String(error())}
								</p>
							)}
						>
							<Loading fallback={<Skeleton id="broken-loading" lines={2} />}>
								<p id="broken">{String(broken())}</p>
							</Loading>
						</Errored>
					</div>
				</div>
			</main>
		)
	})
