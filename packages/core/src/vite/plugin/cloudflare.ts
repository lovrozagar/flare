// Cloudflare Workers is the app's own plugin, as in TanStack Start (B109): `cloudflare({ viteEnvironment: { name:
// "ssr" } })` from @cloudflare/vite-plugin beside flare(), and the Wrangler config's `main` set to flare's worker entry.
// Flare passes the plugin no option; it finds it and checks the two settings it depends on.

// The package export the Wrangler config's `main` names: the app's server behind the Workers adapter.
export const WORKER_MAIN = "@lovrozagar/flare/worker";

const NAME = "vite-plugin-cloudflare";

// Whether the plugins option holds the Cloudflare plugin. `cloudflare()` returns an array of plugins, so nested
// arrays are searched; a falsy entry is skipped, as Vite skips it.
export function composesCloudflare(plugins: readonly unknown[] | undefined): boolean {
	return (plugins ?? []).some((entry) =>
		Array.isArray(entry) ? composesCloudflare(entry) : String(Reflect.get(Object(entry), "name")).startsWith(NAME),
	);
}

// The plugin runs the worker in the ssr environment, whose resolve conditions then hold `workerd`, and the Wrangler
// config's `main` is flare's worker entry. Otherwise the dev server and the build stop with the fix.
export function checkCloudflare(input: { conditions: readonly string[]; main: string | undefined }): void {
	if (!input.conditions.includes("workerd")) {
		throw new Error(
			'The Cloudflare plugin must run in the ssr environment: cloudflare({ viteEnvironment: { name: "ssr" } })',
		);
	}
	if (input.main !== WORKER_MAIN) {
		const found = input.main === undefined ? "it has none" : `it is "${input.main}"`;
		throw new Error(`The Wrangler config's main must be "${WORKER_MAIN}" (${found})`);
	}
}
