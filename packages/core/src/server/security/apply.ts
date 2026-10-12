import { buildCsp } from "./csp.ts";

const KEYS = ["X-Frame-Options", "Content-Security-Policy"] as const;

export type SecurityConfig = Partial<Record<(typeof KEYS)[number], string | false>>;

export function applySecurity(input: {
	url: string;
	headers: Headers;
	routeHeaders?: Record<string, string>;
	security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig) | undefined;
	route?: SecurityConfig;
}): { headers: Headers; nonce: string } {
	const headers = new Headers(input.headers);
	writeRoute(headers, input.routeHeaders);
	const built = buildCsp({ url: input.url });
	for (const [name, value] of built.headers) headers.set(name, value);
	let nonce = built.nonce;
	const server = typeof input.security === "function" ? input.security({ nonce }) : input.security;
	const config: SecurityConfig = { ...server, ...input.route };
	for (const key of KEYS) {
		const value = config[key];
		if (value === undefined) continue;
		const header = key.toLowerCase();
		if (value === false) {
			headers.delete(header);
			if (header === "content-security-policy") nonce = "";
			continue;
		}
		headers.set(header, value);
		if (header === "content-security-policy") nonce = "";
	}
	return { headers, nonce };
}

function writeRoute(headers: Headers, routeHeaders: Record<string, string> | undefined): void {
	if (routeHeaders === undefined) return;
	for (const [key, value] of Object.entries(routeHeaders)) headers.set(key, value);
}

// Parent to child (dx/builder.md `headers(fn)`): names are case-insensitive, a child key wins, `set-cookie` appends
// the child's values after the parent's, and an undefined child value keeps the parent's.
export function mergeHeaders(
	parent: Readonly<Record<string, string | readonly string[]>>,
	child: Readonly<Record<string, string | readonly string[] | undefined>>,
): Record<string, string | string[]> {
	const result: Record<string, string | string[]> = {};
	for (const [key, value] of Object.entries(parent)) result[key.toLowerCase()] = copy(value);
	for (const [name, value] of Object.entries(child)) {
		if (value === undefined) continue;
		const key = name.toLowerCase();
		const prior = result[key];
		result[key] = key === "set-cookie" && prior !== undefined ? [...[prior].flat(), ...[value].flat()] : copy(value);
	}
	return result;
}

function copy(value: string | readonly string[]): string | string[] {
	return typeof value === "string" ? value : [...value];
}
