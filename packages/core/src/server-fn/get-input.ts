/**
 * GET server-fn input codec. Client-safe (no node:async_hooks).
 *
 * Nested objects/arrays JSON-encode so they do not become `[object Object]`.
 * Primitive arrays use repeated keys (`tag=a&tag=b`) to match the existing
 * multi-value GET parser.
 */

function isPrimitive(value: unknown): value is boolean | number | string | null {
	return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function appendGetParam(params: URLSearchParams, key: string, value: unknown): void {
	if (value === undefined) return;
	if (isPrimitive(value)) {
		params.append(key, typeof value === "string" ? value : JSON.stringify(value));
		return;
	}
	if (Array.isArray(value) && value.length === 0) {
		params.append(key, "[]");
		return;
	}
	if (Array.isArray(value) && value.every(isPrimitive)) {
		for (const item of value) {
			params.append(key, typeof item === "string" ? item : JSON.stringify(item));
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
	if (
		val === "true" ||
		val === "false" ||
		val === "null" ||
		(val.startsWith("{") && val.endsWith("}")) ||
		(val.startsWith("[") && val.endsWith("]")) ||
		/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(val)
	) {
		try {
			return JSON.parse(val) as unknown;
		} catch {
			return val;
		}
	}
	return val;
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
