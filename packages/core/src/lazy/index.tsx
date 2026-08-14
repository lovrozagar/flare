import type { JSX } from "solid-js"
import { type Component, createSignal, onMount, Show, sharedConfig } from "solid-js"
import { retryImport } from "../internal.ts"
import { warn } from "../logger.ts"

export interface LazyOptions<P extends Record<string, unknown>> {
	loader: () => Promise<{ default: Component<P> }>
	pending?: Component<P>
}

export interface ClientLazyOptions<P extends Record<string, unknown>> {
	eager?: boolean
	loader: () => Promise<{ default: Component<P> }>
	pending?: Component<P>
}

const PENDING_KEY = "__FLARE_LAZY_PENDING__"
const LOADED_KEY = "__FLARE_LAZY_LOADED__"

function getGlobalPending(): Set<Promise<void>> {
	const g = globalThis as Record<string, unknown>
	if (!g[PENDING_KEY]) g[PENDING_KEY] = new Set<Promise<void>>()
	return g[PENDING_KEY] as Set<Promise<void>>
}

function getGlobalLoaded(): Set<Promise<void>> {
	const g = globalThis as Record<string, unknown>
	if (!g[LOADED_KEY]) g[LOADED_KEY] = new Set<Promise<void>>()
	return g[LOADED_KEY] as Set<Promise<void>>
}

/**
 * Throws during component init — ErrorBoundary catches it.
 * Must be rendered via Show/conditional so the throw happens during
 * the component's initial render phase (not in an effect).
 */
function ThrowError(props: { error: Error }): JSX.Element {
	throw props.error
}

export function lazy<P extends Record<string, unknown>>(options: LazyOptions<P>): Component<P> {
	const { loader, pending } = options
	let loaded: Component<P> | undefined
	let loadError: Error | undefined
	let loadPromise: Promise<void> | undefined

	/* Start loading immediately at factory call */
	loadPromise = retryImport(loader)
		.then((mod) => {
			loaded = mod.default
			getGlobalLoaded().add(loadPromise as Promise<void>)
			getGlobalPending().delete(loadPromise as Promise<void>)
		})
		.catch((e: unknown) => {
			loadError = e instanceof Error ? e : new Error(String(e))
			getGlobalPending().delete(loadPromise as Promise<void>)
		})
	getGlobalPending().add(loadPromise)

	return ((props: P) => {
		const isSSR = !!sharedConfig.context

		/* Pre-known error at render time → throw from component body */
		if (loadError) throw loadError

		const [component, setComponent] = createSignal<Component<P> | undefined>(
			isSSR ? undefined : loaded,
		)
		const [error, setError] = createSignal<Error | undefined>()

		if (isSSR || !loaded) {
			onMount(() => {
				if (loadError) {
					setError(loadError)
				} else if (loaded) {
					setComponent(() => loaded)
				} else {
					loadPromise?.then(() => {
						if (loadError) setError(loadError)
						else setComponent(() => loaded)
					})
				}
			})
		}

		const PendingFallback = pending
			? (() => {
					const P = pending
					return (<P {...props} />) as JSX.Element
				})()
			: null

		return (
			<Show fallback={<ThrowError error={error() as Error} />} when={!error()}>
				<Show fallback={PendingFallback} when={component()}>
					{(Comp) => {
						const C = Comp()
						return (<C {...props} />) as JSX.Element
					}}
				</Show>
			</Show>
		) as JSX.Element
	}) as Component<P>
}

export function clientLazy<P extends Record<string, unknown>>(
	options: ClientLazyOptions<P>,
): Component<P & { pending?: Component<P> }> {
	const { eager, loader, pending: factoryPending } = options
	let loaded: Component<P> | undefined
	let loadError: Error | undefined
	let loadPromise: Promise<void> | undefined

	if (eager) {
		loadPromise = retryImport(loader)
			.then((mod) => {
				loaded = mod.default
			})
			.catch((e: unknown) => {
				loadError = e instanceof Error ? e : new Error(String(e))
			})
	}

	return ((props: P & { pending?: Component<P> }) => {
		const isSSR = !!sharedConfig.context

		/* Pre-known error at render time → throw from component body */
		if (loadError) throw loadError

		const [component, setComponent] = createSignal<Component<P> | undefined>(
			isSSR ? undefined : loaded,
		)
		const [error, setError] = createSignal<Error | undefined>()

		const startLoading = () => {
			if (!loadPromise) {
				loadPromise = retryImport(loader)
					.then((mod) => {
						loaded = mod.default
					})
					.catch((e: unknown) => {
						loadError = e instanceof Error ? e : new Error(String(e))
					})
			}
			loadPromise
				.then(() => {
					if (loadError) setError(loadError)
					else setComponent(() => loaded)
				})
				.catch((e: unknown) => {
					warn("lazy", "chunk retry failed", e)
				})
		}

		if (!isSSR && !loaded) {
			startLoading()
		}

		if (!isSSR && loaded) {
			/* Already loaded — render immediately */
		} else {
			/* SSR hydration or not-yet-loaded: kick off after mount */
			onMount(() => {
				if (loaded) {
					setComponent(() => loaded)
				} else if (loadError) {
					setError(loadError)
				} else {
					startLoading()
				}
			})
		}

		const PendingComp = props.pending ?? factoryPending
		const PendingFallback = PendingComp
			? (() => {
					const P = PendingComp
					return (<P {...(props as P)} />) as JSX.Element
				})()
			: null

		return (
			<Show fallback={<ThrowError error={error() as Error} />} when={!error()}>
				<Show fallback={PendingFallback} when={component()}>
					{(Comp) => {
						const C = Comp()
						return (<C {...(props as P)} />) as JSX.Element
					}}
				</Show>
			</Show>
		) as JSX.Element
	}) as Component<P & { pending?: Component<P> }>
}

export async function waitForLazyPreloads(): Promise<void> {
	const pending = getGlobalPending()
	if (pending.size === 0) return
	await Promise.all(pending)
}

/**
 * Reset global tracking state. No-ops outside test environment.
 */
export function resetLazyState(): void {
	if (process.env.NODE_ENV !== "test") return
	const g = globalThis as Record<string, unknown>
	g[PENDING_KEY] = new Set<Promise<void>>()
	g[LOADED_KEY] = new Set<Promise<void>>()
}
