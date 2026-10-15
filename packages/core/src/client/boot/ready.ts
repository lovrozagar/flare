import type { NavigateOptions } from "../navigation/index.ts"
import type { Location } from "../../shared/url/index.ts"

export type ReadyContext = { navigate: (options: NavigateOptions) => Promise<void>; location: Location }

export type ReadyApi = {
	onReady: (run: (ctx: ReadyContext) => void) => ReadyApi
	onHydrated: (run: () => void) => ReadyApi
	onIdle: (run: () => void) => ReadyApi
	onInteraction: (run: () => void) => ReadyApi
}

// requestIdleCallback is missing in some browsers. Then the idle step runs one second after hydrate.
export type IdleEnv = {
	requestIdle: ((run: IdleRequestCallback, options?: IdleRequestOptions) => void) | undefined
	setTimeout: (run: () => void, ms: number) => void
}

type Phase = "hydrated" | "idle" | "interaction"

const IDLE_TIMEOUT = 1000

// The callbacks register by chaining in the turn createClient returns. Hydrate starts on the next microtask,
// so a later registration would miss its phase and throws instead (dx/client.md).
export function createReady(): {
	api: ReadyApi
	close: () => void
	ready: (ctx: ReadyContext) => void
	hydrated: () => void
	idle: (env: IdleEnv, after: () => void) => void
	interaction: (target: EventTarget) => void
} {
	const readies: ((ctx: ReadyContext) => void)[] = []
	const runs: Record<Phase, (() => void)[]> = { hydrated: [], idle: [], interaction: [] }
	const state = { closed: false }
	const open = (): void => {
		if (state.closed) throw new Error("createClient callbacks register in the same turn as createClient")
	}
	const add = (phase: Phase, run: () => void): ReadyApi => {
		open()
		runs[phase].push(run)
		return api
	}
	const api: ReadyApi = {
		onReady(run) {
			open()
			readies.push(run)
			return api
		},
		onHydrated: (run) => add("hydrated", run),
		onIdle: (run) => add("idle", run),
		onInteraction: (run) => add("interaction", run),
	}
	const fire = (phase: Phase): void => {
		for (const run of runs[phase]) run()
	}
	return {
		api,
		close: () => void (state.closed = true),
		// `ctx` is only { navigate, location } (dx/client.md).
		ready(ctx) {
			for (const run of readies) run({ navigate: ctx.navigate, location: ctx.location })
		},
		hydrated: () => fire("hydrated"),
		// The app's idle callbacks run first. Then `after`, the modules: "all" prefetch (dx/link.md).
		idle: (env, after) =>
			whenIdle(env, () => {
				fire("idle")
				after()
			}),
		interaction: (target) => onFirstInteraction(target, () => fire("interaction")),
	}
}

export function whenIdle(env: IdleEnv, run: () => void): void {
	if (env.requestIdle === undefined) env.setTimeout(run, IDLE_TIMEOUT)
	else env.requestIdle(run, { timeout: IDLE_TIMEOUT })
}

// The first pointerdown or keydown, once. A programmatic navigation is not an interaction.
function onFirstInteraction(target: EventTarget, run: () => void): void {
	const once = (): void => {
		target.removeEventListener("pointerdown", once)
		target.removeEventListener("keydown", once)
		run()
	}
	target.addEventListener("pointerdown", once)
	target.addEventListener("keydown", once)
}

// `modules: "all"` waits for the window's load event, then idle (dx/link.md). A document already loaded runs now.
export function afterLoad(idle: IdleEnv, run: () => void): void {
	if (document.readyState === "complete") return run()
	window.addEventListener("load", () => whenIdle(idle, run), { once: true })
}

// The "render" prefetch trigger: after the current page's load and idle.
export function loadedIdle(idle: IdleEnv): (run: () => void) => void {
	return (run) => whenIdle(idle, () => afterLoad(idle, run))
}
