import type { Router } from "../../shared/router/create-router.ts"
import type { LandOptions } from "../navigation/frames.ts"
import { createPrefetcher, type PrefetchDeps, type PrefetchEnv, type Prefetcher } from "../navigation/prefetch.ts"
import type { UserWork } from "../navigation/user-work.ts"
import { hopProtocol } from "../navigation/warm.ts"
import type { RouterStore } from "../router/store.ts"
import { loadedIdle, type IdleEnv } from "./ready.ts"

// What the window prefetcher reads of the client's env.
type BrowserEnv = Pick<LandOptions, "dev" | "send"> &
	Pick<PrefetchEnv, "network" | "observe"> & { fetch: PrefetchDeps["fetch"]; idle: IdleEnv }

// The prefetcher over the window. A link resolves against the page on screen. The warm-up reads the document's protocol
// from its navigation entry (BUGS.md 520).
export function browserPrefetcher(
	router: Router,
	store: RouterStore,
	{ env, build, work }: { env: BrowserEnv; build: string; work: UserWork },
): Prefetcher {
	return createPrefetcher({
		router,
		origin: window.location.origin,
		current: () => store.snapshot().location,
		fetch: env.fetch,
		build,
		land: { dev: env.dev, send: env.send },
		env: {
			network: env.network,
			observe: env.observe,
			idle: loadedIdle(env.idle),
			head: document.head,
			now: Date.now,
			protocol: hopProtocol(performance.getEntriesByType("navigation") as PerformanceNavigationTiming[]),
		},
		work,
	})
}
