/**
 * Preload utility for lazy loading non-component modules (utils, libs).
 *
 * Features:
 * - Fire & forget preloading
 * - 1 automatic retry on failure (1s delay)
 * - Type-safe throws behavior
 * - Consistent with lazy()/clientLazy() - requires default export
 *
 * @example
 * ```tsx
 * // heavy-pdf-util.ts
 * export default { generatePDF, formatSize }
 *
 * // usage
 * const pdfUtil = preload({
 *   loader: () => import("./heavy-pdf-util"),
 *   throws: true
 * })
 *
 * <button
 *   onMouseEnter={() => pdfUtil.preload()}
 *   onClick={async () => {
 *     const util = await pdfUtil.load()
 *     util.generatePDF(data)
 *   }}
 * >
 *   Export PDF
 * </button>
 * ```
 */

const RETRY_DELAY_MS = 1000
const MAX_ATTEMPTS = 2

interface PreloadOptions<T, R extends boolean = false> {
	/** Dynamic import function - must have default export */
	loader: () => Promise<{ default: T }>

	/**
	 * Error behavior:
	 * - true: throws on error, returns T
	 * - false (default): swallows error, returns T | undefined
	 */
	throws?: R
}

interface PreloadResult<T, R extends boolean> {
	/** Fire & forget - start loading without waiting */
	preload: () => void

	/** Get the default export. Starts loading if not already cached. */
	load: () => Promise<R extends true ? T : T | undefined>

	/** Clear cache to allow fresh retry */
	reset: () => void
}

function preload<T, R extends boolean = false>(options: PreloadOptions<T, R>): PreloadResult<T, R> {
	const { loader, throws = false } = options as PreloadOptions<T, boolean>

	let cached: Promise<T | undefined> | null = null
	let attempt = 0

	const doLoad = (): Promise<T | undefined> => {
		attempt++

		return loader()
			.then((mod) => mod.default)
			.catch((error: unknown) => {
				/* Retry once after delay */
				if (attempt < MAX_ATTEMPTS) {
					return new Promise<T | undefined>((resolve) =>
						setTimeout(() => resolve(doLoad()), RETRY_DELAY_MS),
					)
				}

				/* Exhausted retries - clear cache */
				cached = null

				if (throws) {
					throw error
				}

				return undefined
			})
	}

	return {
		load: () => {
			if (!cached) {
				cached = doLoad()
			}
			return cached as Promise<R extends true ? T : T | undefined>
		},
		preload: () => {
			if (!cached) {
				cached = doLoad()
				/* Fire & forget - swallow errors to prevent unhandled rejection */
				cached.catch(() => {})
			}
		},
		reset: () => {
			cached = null
			attempt = 0
		},
	}
}

export { preload }
export type { PreloadOptions, PreloadResult }
