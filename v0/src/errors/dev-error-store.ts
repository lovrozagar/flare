/**
 * Dev Error Store
 *
 * Global error store for development error overlay.
 * Captures errors via window listeners and provides reactive access.
 * Only active in development mode.
 */

import { type Accessor, createSignal } from "solid-js"

interface SerializedError {
	message: string
	name: string
	source: string
	stack?: string
}

interface CapturedError {
	dismissed: boolean
	error: Error
	id: string
	source: string
	timestamp: number
}

interface DevErrorStore {
	clear: () => void
	dismiss: (id: string) => void
	errors: Accessor<CapturedError[]>
	hasErrors: () => boolean
	register: (error: Error | SerializedError, source?: string) => void
}

const DEV_ERROR_STORE_KEY = "__FLARE_DEV_ERROR_STORE__"

function generateErrorId(error: Error, source?: string): string {
	const raw = `${error.name}:${error.message}:${source ?? ""}:${error.stack?.slice(0, 100) ?? ""}`
	let hash = 0
	for (let i = 0; i < raw.length; i++) {
		const char = raw.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash
	}
	return `flare-err-${Math.abs(hash).toString(36)}`
}

const SIGNAL_KEY = "__FLARE_DEV_ERROR_SIGNAL__"

interface SignalStore {
	errors: Accessor<CapturedError[]>
	setErrors: (fn: CapturedError[] | ((prev: CapturedError[]) => CapturedError[])) => void
}

function getOrCreateSignal(): SignalStore {
	const g = globalThis as unknown as Record<string, SignalStore | undefined>
	if (g[SIGNAL_KEY]) {
		return g[SIGNAL_KEY]
	}
	const [errors, setErrors] = createSignal<CapturedError[]>([])
	const store: SignalStore = { errors, setErrors }
	g[SIGNAL_KEY] = store
	return store
}

function createDevErrorStore(): DevErrorStore {
	const { errors, setErrors } = getOrCreateSignal()

	return {
		clear() {
			setErrors([])
		},
		dismiss(id: string) {
			setErrors((prev) => prev.map((e) => (e.id === id ? { ...e, dismissed: true } : e)))
		},
		errors,
		hasErrors() {
			return errors().some((e) => !e.dismissed)
		},
		register(errorOrSerialized: Error | SerializedError, source?: string) {
			let error: Error
			let errorSource: string

			if (errorOrSerialized instanceof Error) {
				error = errorOrSerialized
				errorSource = source ?? "runtime"
			} else {
				error = new Error(errorOrSerialized.message)
				error.name = errorOrSerialized.name
				if (errorOrSerialized.stack) {
					error.stack = errorOrSerialized.stack
				}
				errorSource = errorOrSerialized.source
			}

			const id = generateErrorId(error, errorSource)

			setErrors((prev) => {
				/* Dedupe by ID */
				if (prev.some((e) => e.id === id)) {
					return prev
				}
				return [
					...prev,
					{
						dismissed: false,
						error,
						id,
						source: errorSource,
						timestamp: Date.now(),
					},
				]
			})
		},
	}
}

let cachedStore: DevErrorStore | null = null

function getOrCreateDevErrorStore(): DevErrorStore {
	if (cachedStore) {
		return cachedStore
	}

	/* Check globalThis for SSR/HMR persistence */
	const g = globalThis as unknown as Record<string, DevErrorStore | undefined>
	const existing = g[DEV_ERROR_STORE_KEY]
	if (existing) {
		cachedStore = existing
		return existing
	}

	const store = createDevErrorStore()
	g[DEV_ERROR_STORE_KEY] = store
	cachedStore = store
	return store
}

const devErrorStore = getOrCreateDevErrorStore()

/* Attach global listeners (client-side only, dev only) */
if (import.meta.env.DEV && typeof window !== "undefined") {
	window.addEventListener("error", (event) => {
		const error = event.error ?? new Error(event.message)
		devErrorStore.register(error, "window.onerror")
	})

	window.addEventListener("unhandledrejection", (event) => {
		const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
		devErrorStore.register(error, "unhandledrejection")
	})
}

export type { CapturedError, DevErrorStore, SerializedError }
export { devErrorStore, getOrCreateDevErrorStore }
