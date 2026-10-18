import { createPage } from "@lovrozagar/flare"

// The public status page: no session, stored in the shared store under the `status` tag. Fresh for its whole ttl, so
// one render serves every visitor until a purge (dx/cache.md: a `staleTime` of 0, the default, re-renders behind every
// hit). The render id tells one stored render from the next.
export const route = createPage("_root_/status")
	.cache({ ssr: { ttl: "1h", staleTime: "1h", tags: ["status"] } })
	.loader(() => ({ render: crypto.randomUUID().slice(0, 8) }))
	.head(() => ({ title: "Status — Dashboard" }))
	.render((props) => (
		<main class="mx-auto max-w-md px-6 py-16">
			<h1 id="title" class="text-lg font-semibold">
				All systems normal
			</h1>
			<p class="mt-2 text-sm text-slate-500">
				Render <code id="render">{props.loaderData.render}</code>
			</p>
		</main>
	))
