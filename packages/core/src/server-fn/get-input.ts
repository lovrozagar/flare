/**
 * GET server-fn input codec. Client-safe (no node:async_hooks).
 *
 * Nested objects/arrays JSON-encode so they do not become `[object Object]`.
 * Primitive arrays use repeated keys (`tag=a&tag=b`) to match the existing
 * multi-value GET parser. Strings that look like JSON literals are quoted so
 * `{ id: "42" }` and `{ id: 42 }` round-trip as distinct values.
 */

function isPrimitive(value: unknown): value is boolean | number | string | null {
	return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/** Query tokens that JSON.parse would accept — quote strings that collide with these. */
function isJsonLiteralToken(val: string): boolean {
	if (val === "true" || val === "false" || val === "null") return true;
	if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) return true;
	if ((val.startsWith("{") && val.endsWith("}")) || (val.startsWith("[") && val.endsWith("]"))) return true;
	return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(val);
}

function encodeGetPrimitive(value: boolean | number | string | null): string {
	if (typeof value === "string") return isJsonLiteralToken(value) ? JSON.stringify(value) : value;
	return JSON.stringify(value);
}

function appendGetParam(params: URLSearchParams, key: string, value: unknown): void {
	if (value === undefined) return;
	if (isPrimitive(value)) {
		params.append(key, encodeGetPrimitive(value));
		return;
	}
	if (Array.isArray(value) && value.length === 0) {
		params.append(key, "[]");
		return;
	}
	if (Array.isArray(value) && value.every(isPrimitive)) {
		for (const item of value) {
			params.append(key, encodeGetPrimitive(item));
		}
		return;
	}
	params.append(key, JSON.stringify(value));
}

export function serializeGetInput(input: unknown): string {
	if (input === undefined || input === null) return "";
	if (typeof input !== "object" || Array.isArray(input)) {
		const params = new URLSearchParams();
		appendGetParam(params, "value", input);
		return params.toString();
	}
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
		appendGetParam(params, key, value);
	}
	return params.toString();
}

export function serverFnGetUrl(path: string, input: unknown): string {
	if (input === undefined) return path;
	const qs = serializeGetInput(input);
	return qs.length > 0 ? `${path}?${qs}` : path;
}

function parseGetValue(val: string): unknown {
	if (!isJsonLiteralToken(val)) return val;
	try {
		return JSON.parse(val) as unknown;
	} catch {
		return val;
	}
}

export function parseGetSearchParams(searchParams: URLSearchParams): Record<string, unknown> | undefined {
	const obj: Record<string, unknown> = Object.create(null);
	let hasParams = false;
	for (const [key, val] of searchParams) {
		if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
		hasParams = true;
		const parsed = parseGetValue(val);
		const existing = obj[key];
		if (existing !== undefined) {
			obj[key] = Array.isArray(existing) ? [...(existing as unknown[]), parsed] : [existing, parsed];
		} else {
			obj[key] = parsed;
		}
	}
	return hasParams ? obj : undefined;
}
