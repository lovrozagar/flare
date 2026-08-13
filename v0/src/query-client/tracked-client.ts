/**
 * Tracked QueryClient
 *
 * Proxy wrapper for QueryClient that auto-tracks data-fetching methods.
 * Behaves exactly like original QueryClient + tracking.
 *
 * Tracked methods (6):
 * - ensureQueryData, ensureInfiniteQueryData
 * - fetchQuery, fetchInfiniteQuery
 * - prefetchQuery, prefetchInfiniteQuery
 */

interface TrackedQuery {
	data: unknown
	key: unknown[]
	staleTime?: number
}

interface QueryOptions {
	queryFn: () => Promise<unknown>
	queryKey: unknown[]
	staleTime?: number
}

/* Methods that return data directly */
const TRACKED_DATA_METHODS = new Set([
	"ensureQueryData",
	"ensureInfiniteQueryData",
	"fetchQuery",
	"fetchInfiniteQuery",
])

/* Methods that return void, data read from cache after */
const TRACKED_PREFETCH_METHODS = new Set(["prefetchQuery", "prefetchInfiniteQuery"])

/* Extended QueryClient with tracking methods */
type TrackedQueryClient<T> = T & {
	clearTracked: () => void
	getTrackedQueries: () => TrackedQuery[]
}

function createTrackedQueryClient<T extends object>(qc: T): TrackedQueryClient<T> {
	const tracked = new Map<string, TrackedQuery>()

	function keyToString(key: unknown[]): string {
		return JSON.stringify(key)
	}

	function trackQuery(key: unknown[], data: unknown, staleTime?: number): void {
		const keyStr = keyToString(key)
		tracked.set(keyStr, { data, key, staleTime })
	}

	function getTrackedQueries(): TrackedQuery[] {
		return Array.from(tracked.values())
	}

	function clearTracked(): void {
		tracked.clear()
	}

	const proxy = new Proxy(qc, {
		get(target, prop: string) {
			/* Tracking methods */
			if (prop === "getTrackedQueries") {
				return getTrackedQueries
			}
			if (prop === "clearTracked") {
				return clearTracked
			}

			const value = Reflect.get(target, prop)

			/* Not a function - pass through */
			if (typeof value !== "function") {
				return value
			}

			/* Data methods - track returned data */
			if (TRACKED_DATA_METHODS.has(prop)) {
				return async (options: QueryOptions) => {
					const data = await value.call(target, options)
					trackQuery(options.queryKey, data, options.staleTime)
					return data
				}
			}

			/* Prefetch methods - read data from cache after */
			if (TRACKED_PREFETCH_METHODS.has(prop)) {
				return async (options: QueryOptions) => {
					await value.call(target, options)
					const getQueryData = Reflect.get(target, "getQueryData") as (key: unknown[]) => unknown
					const data = getQueryData.call(target, options.queryKey)
					trackQuery(options.queryKey, data, options.staleTime)
				}
			}

			/* All other methods - pass through bound to target */
			return value.bind(target)
		},
	})

	return proxy as TrackedQueryClient<T>
}

export type { QueryOptions, TrackedQuery, TrackedQueryClient }

export { createTrackedQueryClient }
