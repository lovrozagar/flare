import { getRevalidationContext } from "@lovrozagar/flare/server-context";
import { type FlareStore, scopeStaticKey } from "../store/index.ts";

export type RevalidateFn = (options: RevalidateOptions) => Promise<void>;

export type RevalidationTier = "cdn" | "ssr";

export interface RevalidateOptions {
	callerData?: unknown;
	keys?: string[];
	tags?: string[];
	tiers: RevalidationTier[];
}

export interface CdnPurgeAdapter {
	purgeByKeys?(keys: string[], callerData?: unknown): Promise<void>;
	purgeByTags(tags: string[], callerData?: unknown): Promise<void>;
}

export interface CreateRevalidateFnConfig {
	/** Running build: `static:/path` keys address this build's store entries. */
	buildId?: string;
	cdnPurgeAdapter?: CdnPurgeAdapter;
	store?: FlareStore;
}

export function createRevalidateFn(config: CreateRevalidateFnConfig): RevalidateFn {
	return async (options: RevalidateOptions) => {
		const { callerData, keys, tags, tiers } = options;
		const promises: Promise<void>[] = [];

		for (const tier of tiers) {
			if (tier === "ssr") {
				if (!config.store) {
					throw new Error(
						"Revalidation tier 'ssr' not configured. Provide a FlareStore via createRevalidateFn({ store: ... }).",
					);
				}
				if (tags && tags.length > 0) {
					promises.push(config.store.deleteByTags(tags, callerData));
				}
				if (keys && keys.length > 0) {
					const { buildId } = config;
					const storeKeys = buildId ? keys.map((k) => scopeStaticKey(k, buildId)) : keys;
					if (config.store.deleteByKeys) {
						promises.push(config.store.deleteByKeys(storeKeys, callerData));
					} else {
						for (const key of storeKeys) {
							promises.push(config.store.delete(key));
						}
					}
				}
			} else if (tier === "cdn") {
				if (!config.cdnPurgeAdapter) {
					throw new Error(
						"Revalidation tier 'cdn' not configured. Provide a CdnPurgeAdapter via createRevalidateFn({ cdnPurgeAdapter: ... }).",
					);
				}
				if (tags && tags.length > 0) {
					promises.push(config.cdnPurgeAdapter.purgeByTags(tags, callerData));
				}
				if (keys && keys.length > 0) {
					if (config.cdnPurgeAdapter.purgeByKeys) {
						promises.push(config.cdnPurgeAdapter.purgeByKeys(keys, callerData));
					}
				}
			}
		}

		const results = await Promise.allSettled(promises);
		const errors = results
			.filter((r): r is PromiseRejectedResult => r.status === "rejected")
			.map((r) => r.reason as Error);
		if (errors.length > 0) {
			const msg = errors.map((e) => e.message).join("; ");
			throw new AggregateError(errors, `Revalidation failed: ${msg}`);
		}
	};
}

/**
 * Importable revalidate() — reads adapters from ALS, works anywhere in request scope.
 */
export function revalidate(options: RevalidateOptions): Promise<void> {
	const ctx = getRevalidationContext();
	const fn = createRevalidateFn(ctx);
	return fn(options);
}
