/** Resolved flare plugin options — frozen, constructed once at plugin entry. */
export interface ResolvedFlareOptions {
	/** URL prefix for emitted assets. Empty string means root-relative ("/file.js"). */
	readonly assetsBase: string;
	/** On-disk directory inside outDir where assets are written. No leading slash. */
	readonly assetsDir: string;
}

/** Validated, normalized assetsBase string. Throws with option name on violation. `"/"` → `""`. */
export function validateAssetsBase(value: unknown): string {
	if (typeof value !== "string") {
		throw new Error(`flare: assetsBase must be a string (got ${JSON.stringify(value)})`);
	}
	if (value.length === 0) {
		throw new Error(`flare: assetsBase must not be empty (got ${JSON.stringify(value)})`);
	}
	/* Root-slash case — valid, normalizes to empty string so concat works uniformly */
	if (value === "/") return "";
	if (!value.startsWith("/")) {
		throw new Error(`flare: assetsBase must start with "/" (got ${JSON.stringify(value)})`);
	}
	if (value.endsWith("/")) {
		throw new Error(`flare: assetsBase must not end with "/" (got ${JSON.stringify(value)})`);
	}
	if (value.includes("?") || value.includes("#")) {
		throw new Error(`flare: assetsBase must not contain "?" or "#" (got ${JSON.stringify(value)})`);
	}
	return value;
}

/** Resolves raw flare plugin config into a frozen, validated options object. */
export function resolveFlareOptions(raw: { assetsBase?: unknown }): ResolvedFlareOptions {
	const assetsBase = raw.assetsBase === undefined ? "/assets" : validateAssetsBase(raw.assetsBase);
	/* strip leading "/" — "/app/assets" → "app/assets", "" (root) → "assets" fallback */
	const assetsDir = assetsBase === "" ? "assets" : assetsBase.slice(1);
	return Object.freeze({ assetsBase, assetsDir });
}
