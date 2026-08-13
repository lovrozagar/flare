/**
 * SSR-enabled lazy component with pending/error handling.
 *
 * Loads component synchronously before render (on both server and client)
 * to ensure identical tree structure for hydration.
 *
 * @example
 * ```tsx
 * const HeavyChart = lazy({
 *   loader: () => import("./HeavyChart"),
 *   pending: () => <ChartSkeleton />,
 *   error: (e, retry) => <button onClick={retry}>Retry</button>
 * })
 *
 * <HeavyChart data={data} />
 * ```
 */

import {
	type Component,
	createMemo,
	createSignal,
	type JSX,
	onMount,
	sharedConfig,
	splitProps,
} from "solid-js"
import { isServer } from "solid-js/web"

type ErrorRender = (error: Error, retry: () => void) => JSX.Element

interface LazyOptions<P extends object> {
	/** Dynamic import function */
	loader: () => Promise<{ default: Component<P> }>

	/** Pending fallback while loading */
	pending?: () => JSX.Element

	/** Error fallback with retry */
	error?: ErrorRender
}

interface LazyProps {
	/** Override pending fallback */
	pending?: JSX.Element

	/** Override error fallback */
	error?: JSX.Element | ErrorRender
}

/**
 * Global registry of preload promises.
 * Using globalThis ensures same array across all bundled chunks.
 */
const PRELOAD_KEY = "__FLARE_LAZY_PRELOADS__"
function getPreloadPromises(): Promise<unknown>[] {
	if (isServer) return []
	const g = globalThis as Record<string, unknown>
	if (!g[PRELOAD_KEY]) {
		g[PRELOAD_KEY] = []
	}
	return g[PRELOAD_KEY] as Promise<unknown>[]
}

/**
 * Global registry of loaded components.
 * Stores the component after preload so render can access it synchronously.
 * Uses function reference as key for identity-based lookup.
 */
const LOADED_KEY = "__FLARE_LAZY_LOADED__"
type LoaderFn = () => Promise<{ default: Component<object> }>
type LoadedMap = Map<LoaderFn, Component<object>>
function getLoadedComponents(): LoadedMap {
	const g = globalThis as Record<string, unknown>
	if (!g[LOADED_KEY]) {
		g[LOADED_KEY] = new Map()
	}
	return g[LOADED_KEY] as LoadedMap
}

/**
 * Wait for all lazy components to preload.
 * Call this before hydrate() to prevent hydration mismatch.
 */
export function waitForLazyPreloads(): Promise<void> {
	const promises = getPreloadPromises()
	if (promises.length === 0) return Promise.resolve()
	return Promise.all(promises).then(() => {})
}

function lazy<P extends object>(options: LazyOptions<P>): Component<P & LazyProps> {
	const { loader, pending: defaultPending, error: defaultError } = options

	/**
	 * On client, preload immediately and store the loaded component.
	 */
	if (!isServer) {
		const preloadPromise = loader().then((mod) => {
			getLoadedComponents().set(loader as LoaderFn, mod.default as Component<object>)
			return mod
		})
		getPreloadPromises().push(preloadPromise)
	}

	return (props: P & LazyProps): JSX.Element => {
		const [local, rest] = splitProps(props, ["pending", "error"])
		const errorFallback = local.error ?? defaultError
		const pendingFallback = (local.pending ?? defaultPending?.() ?? null) as JSX.Element

		/**
		 * Check if we're currently hydrating.
		 * During hydration, we must render pending to match server HTML.
		 */
		const isHydrating = !isServer && !!sharedConfig.context
		const preloadedComp = isServer
			? undefined
			: (getLoadedComponents().get(loader as LoaderFn) as Component<P> | undefined)

		/**
		 * Use signal to track component loading for reactivity.
		 * During hydration, start with undefined to match server's pending state.
		 * After hydration completes, update to preloaded component.
		 */
		const [comp, setComp] = createSignal<Component<P> | undefined>(
			isHydrating ? undefined : preloadedComp,
		)
		const [error, setError] = createSignal<Error | undefined>()
		const [retryCount, setRetryCount] = createSignal(0)

		/**
		 * After hydration completes (on mount), update to preloaded component.
		 */
		if (!isServer) {
			onMount(() => {
				const loaded = getLoadedComponents().get(loader as LoaderFn) as Component<P> | undefined
				if (loaded) {
					setComp(() => loaded)
				} else {
					loader()
						.then((mod) => setComp(() => mod.default))
						.catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
				}
			})
		}

		const retry = () => {
			setError(undefined)
			setRetryCount((c) => c + 1)
			loader()
				.then((mod) => setComp(() => mod.default))
				.catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
		}

		const renderError = (err: Error): JSX.Element => {
			if (!errorFallback) return null as unknown as JSX.Element
			if (typeof errorFallback === "function") return errorFallback(err, retry)
			return errorFallback
		}

		/**
		 * Render directly without Suspense to avoid hydration marker mismatch.
		 * Both server and client render pending initially.
		 * After hydration (onMount), client updates to show actual component.
		 */
		return createMemo(() => {
			const Comp = comp()
			const err = error()
			retryCount() /* track for reactivity */

			if (err) return renderError(err)
			if (Comp) return <Comp {...(rest as P)} />
			return pendingFallback
		}) as unknown as JSX.Element
	}
}

export { lazy }
export type { LazyOptions, LazyProps }
