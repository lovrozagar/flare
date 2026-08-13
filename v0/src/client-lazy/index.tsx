/**
 * Client-only lazy component. Never renders on server.
 * Based on SolidStart's clientOnly pattern.
 */

import {
	type Component,
	createMemo,
	createSignal,
	type JSX,
	onMount,
	type Setter,
	sharedConfig,
	splitProps,
	untrack,
} from "solid-js"
import { isServer } from "solid-js/web"

type ErrorRender = (error: Error, retry: () => void) => JSX.Element

interface ClientLazyOptions<P extends object> {
	loader: () => Promise<{ default: Component<P> }>
	pending?: () => JSX.Element
	error?: ErrorRender
	/** If true, start loading on module evaluation. If false (default), load on first render. */
	eager?: boolean
}

interface ClientLazyProps {
	pending?: JSX.Element
	error?: JSX.Element | ErrorRender
}

/**
 * Load function - matches SolidStart's pattern exactly
 */
function load<T extends Component<any>>(
	fn: () => Promise<{ default: T }>,
	setComp: Setter<T | undefined>,
	setError?: Setter<Error | undefined>,
) {
	fn()
		.then((m) => setComp(() => m.default))
		.catch((e) => setError?.(() => (e instanceof Error ? e : new Error(String(e)))))
}

function clientLazy<P extends object>(
	options: ClientLazyOptions<P>,
): Component<P & ClientLazyProps> {
	const { loader, pending: defaultPending, error: defaultError, eager = false } = options

	/* Server: always return pending fallback */
	if (isServer) {
		return (props: P & ClientLazyProps) => {
			const [local] = splitProps(props, ["pending", "error"])
			return (local.pending ?? defaultPending?.() ?? null) as JSX.Element
		}
	}

	/* Client: create signals at factory level (outside component) */
	const [comp, setComp] = createSignal<Component<P>>()
	const [loadError, setLoadError] = createSignal<Error>()

	/* If eager, load immediately at module evaluation time */
	if (eager) {
		load(loader, setComp, setLoadError)
	}

	return (props: P & ClientLazyProps) => {
		let Comp: Component<P> | undefined
		let m: boolean
		const [local, rest] = splitProps(props, ["pending", "error"])

		/* If not eager, load on first render */
		if (!eager) {
			load(loader, setComp, setLoadError)
		}

		/* Quick path: already loaded and not in hydration context */
		Comp = comp()
		if (Comp && !sharedConfig.context) {
			return Comp(rest as P)
		}

		/* Track mount state for hydration - start as false during hydration */
		const [mounted, setMounted] = createSignal(!sharedConfig.context)
		onMount(() => {
			setMounted(true)
		})

		/* Retry function for error recovery */
		const retry = () => {
			setLoadError(undefined)
			load(loader, setComp, setLoadError)
		}

		/* Reactive memo that tracks comp, mounted, and loadError - matches SolidStart pattern */
		return createMemo(() => {
			Comp = comp()
			const err = loadError()
			m = mounted()
			return untrack(() => {
				/* Handle errors first */
				if (err) {
					const errorFb = local.error ?? defaultError
					if (!errorFb) return null as unknown as JSX.Element
					return typeof errorFb === "function" ? errorFb(err, retry) : errorFb
				}
				/* Render component when loaded and mounted */
				if (Comp && m) return Comp(rest as P)
				/* Fallback to pending */
				return (local.pending ?? defaultPending?.() ?? null) as JSX.Element
			})
		}) as unknown as JSX.Element
	}
}

export { clientLazy }
export type { ClientLazyOptions, ClientLazyProps }
