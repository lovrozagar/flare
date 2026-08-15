const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 2;

interface PreloadOptions<T, R extends boolean = false> {
	loader: () => Promise<{ default: T }>;
	throws?: R;
}

interface PreloadResult<T, R extends boolean> {
	load: () => Promise<R extends true ? T : T | undefined>;
	preload: () => void;
	reset: () => void;
}

export function preload<T, R extends boolean = false>(options: PreloadOptions<T, R>): PreloadResult<T, R> {
	let cached: Promise<T | undefined> | null = null;
	let attempts = 0;
	let generation = 0;

	function doLoad(gen: number): Promise<T | undefined> {
		attempts++;
		return options.loader().then(
			(mod) => mod.default,
			(error: unknown) => {
				/* Discard stale retry from previous generation */
				if (gen !== generation) return undefined;
				if (attempts < MAX_ATTEMPTS) {
					return new Promise<T | undefined>((resolve) => {
						setTimeout(() => {
							/* Check generation again after delay */
							if (gen !== generation) {
								resolve(undefined);
								return;
							}
							resolve(doLoad(gen));
						}, RETRY_DELAY_MS);
					});
				}
				/* exhausted — clear cache for fresh attempt next time */
				cached = null;
				attempts = 0;
				if (options.throws) {
					throw error;
				}
				return undefined;
			},
		);
	}

	function load(): Promise<T | undefined> {
		if (!cached) {
			cached = doLoad(generation);
			cached.catch(() => {});
		}
		return cached;
	}

	function preloadFn(): void {
		if (!cached) {
			cached = doLoad(generation);
			/* swallow unhandled rejection */
			cached.catch(() => {});
		}
	}

	function reset(): void {
		cached = null;
		attempts = 0;
		generation++;
	}

	return {
		load: load as PreloadResult<T, R>["load"],
		preload: preloadFn,
		reset,
	};
}
