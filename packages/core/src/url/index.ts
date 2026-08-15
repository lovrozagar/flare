export type SearchParams = Record<string, string | string[]>;

export function parseSearchParams(sp: URLSearchParams): SearchParams {
	const result: SearchParams = Object.create(null);
	for (const [key, value] of sp) {
		if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
		const existing = result[key];
		if (existing === undefined) {
			result[key] = value;
		} else if (Array.isArray(existing)) {
			existing.push(value);
		} else {
			result[key] = [existing, value];
		}
	}
	return result;
}

export interface BuildUrlOptions {
	hash?: string;
	params?: Record<string, unknown>;
	search?: Record<string, unknown>;
	to: string;
}

const OPTIONAL_CATCH_ALL_RE = /\[\[\.\.\.(\w+)\]\]/g;
const OPTIONAL_SINGLE_RE = /\[\[(?!\.\.\.)(\w+)\]\]/g;
const REQUIRED_CATCH_ALL_RE = /\[\.\.\.(\w+)\]/g;
const REQUIRED_SINGLE_RE = /\[(\w+)\]/g;
const OPTIONAL_SINGLE_CLEANUP_RE = /\/?\[\[(?!\.\.\.)(\w+)\]\]/g;
const DOUBLE_SLASH_RE = /(^|[^:])\/{2,}/g;

export function resolvePathParams(path: string, params: Record<string, unknown>): string {
	let resolved = path;

	/* 1. optional catch-all [[...param]] */
	resolved = resolved.replace(OPTIONAL_CATCH_ALL_RE, (_match, name: string) => {
		const value = params[name];
		if (value === undefined || (Array.isArray(value) && value.length === 0)) {
			return "";
		}
		if (Array.isArray(value)) {
			return value
				.filter((v) => v !== undefined)
				.map((v) => encodeURIComponent(String(v)))
				.join("/");
		}
		return encodeURIComponent(String(value));
	});

	/* 2. optional single [[param]] (negative lookahead avoids catch-all) */
	resolved = resolved.replace(OPTIONAL_SINGLE_RE, (_match, name: string) => {
		const value = params[name];
		if (value === undefined || value === "") {
			return `[[${name}]]`;
		}
		if (Array.isArray(value)) {
			return `[[${name}]]`;
		}
		return encodeURIComponent(String(value));
	});

	/* remove optional single placeholders that weren't resolved (with optional leading slash) */
	resolved = resolved.replace(OPTIONAL_SINGLE_CLEANUP_RE, "");

	/* Collapse double slashes from empty optional params in mid-path (preserve ://) */
	resolved = resolved.replace(DOUBLE_SLASH_RE, "$1/");

	if (resolved === "") {
		resolved = "/";
	}

	/* 3. required catch-all [...param] */
	resolved = resolved.replace(REQUIRED_CATCH_ALL_RE, (_match, name: string) => {
		const value = params[name];
		if (value === undefined) {
			throw new Error(`Missing required catch-all param: ${name}`);
		}
		if (!Array.isArray(value)) {
			throw new Error(`Catch-all param ${name} must be an array, got ${typeof value}`);
		}
		if (value.length === 0) {
			throw new Error(`Required catch-all param ${name} must have at least one segment`);
		}
		return value
			.filter((v) => v !== undefined)
			.map((v) => encodeURIComponent(String(v)))
			.join("/");
	});

	/* 4. required single [param] */
	resolved = resolved.replace(REQUIRED_SINGLE_RE, (_match, name: string) => {
		const value = params[name];
		if (value === undefined) {
			throw new Error(`Missing required param: ${name}`);
		}
		if (Array.isArray(value)) {
			throw new Error(`Param ${name} must be string, got array`);
		}
		return encodeURIComponent(String(value));
	});

	return resolved;
}

export function serializeSearchParams(search: Record<string, unknown>): string {
	const parts: string[] = [];
	const keys = Object.keys(search).sort();

	for (const key of keys) {
		const value = search[key];
		if (value === null || value === undefined) continue;

		if (Array.isArray(value)) {
			for (const item of value) {
				parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
			}
		} else {
			parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		}
	}

	return parts.join("&");
}

export function buildUrl(options: BuildUrlOptions): string {
	let result = resolvePathParams(options.to, options.params ?? {});

	const search = options.search ? serializeSearchParams(options.search) : "";
	if (search.length > 0) {
		result = `${result}?${search}`;
	}

	if (options.hash !== undefined) {
		const hash = options.hash.startsWith("#") ? options.hash.slice(1) : options.hash;
		result = `${result}#${hash}`;
	}

	return result;
}
