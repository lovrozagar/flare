/**
 * Defer Helper
 *
 * Deferred streaming for SSR/CSR.
 * Wraps promises to stream after shell renders.
 *
 * Behavior by context:
 * - Initial load + awaitOnInitialLoad: true → await (block until resolved)
 * - Initial load + awaitOnInitialLoad: undefined → default based on config
 * - CSR nav → always stream (awaitOnInitialLoad ignored)
 */

interface DeferredPromise<T = unknown> {
	key: string
	matchId: string | null
	promise: Promise<T>
	ref: Deferred<T>
	stream: boolean
}

interface Deferred<T> {
	__deferred: true
	__error?: { message: string }
	__key?: string
	__resolved?: T
	promise: Promise<T>
}

interface DeferOptions {
	awaitOnInitialLoad?: boolean
	key?: string
}

interface DeferContextOptions {
	defaultAwaitOnInitialLoad?: boolean
	initialLoad?: boolean
	matchId?: string
}

interface AwaitDeferredOptions {
	awaitAll?: boolean
}

interface DeferContext {
	awaitDeferred: (opts?: AwaitDeferredOptions) => Promise<Map<string, unknown>>
	defaultAwaitOnInitialLoad: boolean
	defer: <T>(fn: () => Promise<T>, options?: DeferOptions) => Deferred<T>
	getDeferred: () => DeferredPromise[]
	initialLoad: boolean
}

function createDeferContext(options: DeferContextOptions): DeferContext {
	const initialLoad = options.initialLoad ?? true
	const defaultAwaitOnInitialLoad = options.defaultAwaitOnInitialLoad ?? false
	const matchId = options.matchId ?? null
	const deferred: DeferredPromise[] = []
	let deferIndex = 0

	function defer<T>(fn: () => Promise<T>, opts?: DeferOptions): Deferred<T> {
		const key = opts?.key ?? `d${deferIndex++}`
		const promise = fn()

		/* Determine stream behavior */
		let stream: boolean
		if (!initialLoad) {
			/* CSR nav ALWAYS streams - defer is always useful on soft nav */
			stream = true
		} else if (opts?.awaitOnInitialLoad !== undefined) {
			/* Initial load - explicit option */
			stream = !opts.awaitOnInitialLoad
		} else {
			/* Initial load - default based on config */
			stream = !defaultAwaitOnInitialLoad
		}

		const ref: Deferred<T> = {
			__deferred: true as const,
			__key: key,
			promise,
		}

		deferred.push({
			key,
			matchId,
			promise: promise as Promise<unknown>,
			ref: ref as Deferred<unknown>,
			stream,
		})

		return ref
	}

	function getDeferred(): DeferredPromise[] {
		return deferred
	}

	async function awaitDeferredFn(opts?: AwaitDeferredOptions): Promise<Map<string, unknown>> {
		const results = new Map<string, unknown>()
		/* SSR should await ALL deferred (awaitAll: true), CSR nav only awaits non-streaming */
		const toAwait = opts?.awaitAll ? deferred : deferred.filter((d) => !d.stream)

		const settled = await Promise.allSettled(toAwait.map((d) => d.promise))

		for (let i = 0; i < toAwait.length; i++) {
			const d = toAwait[i]
			const result = settled[i]
			if (d && result?.status === "fulfilled") {
				results.set(d.key, result.value)
				/* Store resolved value in the Deferred ref for SSR */
				d.ref.__resolved = result.value
			} else if (d && result?.status === "rejected") {
				/* Store error as serializable object for SSR hydration */
				const error =
					result.reason instanceof Error ? result.reason : new Error(String(result.reason))
				d.ref.__error = { message: error.message }
			}
		}

		return results
	}

	return {
		awaitDeferred: awaitDeferredFn,
		defaultAwaitOnInitialLoad,
		defer,
		getDeferred,
		initialLoad,
	}
}

export type { DeferContext, DeferContextOptions, DeferOptions, Deferred, DeferredPromise }

export { createDeferContext }
