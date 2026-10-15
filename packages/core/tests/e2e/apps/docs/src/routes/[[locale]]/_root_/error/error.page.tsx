import { createPage } from "@lovrozagar/flare"

const FIXED = "docs.fixed=1"

// The loader throws until the visitor sets the `docs.fixed` cookie. `reset()` replaces the URL in place and runs
// the loader again, so the fix shows without a history entry.
export const route = createPage("[[locale]]/_root_/error")
	.loader(({ request }) => {
		if (!(request.headers.get("cookie") ?? "").includes(FIXED)) throw new Error("The demo loader failed")
		return { ok: true }
	})
	.head(() => ({ title: "Error boundary — Flare docs", robots: { index: false } }))
	.render(() => (
		<main class="mx-auto max-w-2xl px-5 py-16">
			<h1 id="error-recovered" class="text-2xl font-semibold">
				Recovered
			</h1>
			<p class="mt-2 text-stone-500">The loader ran again after reset and succeeded.</p>
		</main>
	))
	.errorRender((props) => (
		<main class="mx-auto max-w-2xl px-5 py-16">
			<h1 id="error-boundary" class="text-2xl font-semibold">
				This page failed
			</h1>
			<p id="error-message" class="mt-2 text-stone-500">
				{props.error.message}
			</p>
			<button
				id="error-reset"
				type="button"
				class="mt-6 rounded-md bg-flame-500 px-3 py-1.5 text-sm text-white"
				onClick={() => {
					document.cookie = `${FIXED}; Path=/; SameSite=Lax`
					props.reset()
				}}
			>
				Fix it and retry
			</button>
		</main>
	))
