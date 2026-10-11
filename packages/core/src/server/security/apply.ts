import { buildCsp } from "./csp.ts";

const KEYS = ["X-Frame-Options", "Content-Security-Policy"] as const;

export type SecurityConfig = Partial<Record<(typeof KEYS)[number], string | false>>;

export function applySecurity(input: {
	url: string;
	headers: Headers;
	routeHeaders?: Record<string, string>;
	security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig);
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

export function mergeHeaders(
	parent: Record<string, string>,
	child: Record<string, string | undefined>,
): Record<string, string | string[]> {
	const result: Record<string, string | string[]> = { ...parent };
	for (const [key, value] of Object.entries(child)) {
		if (value === undefined) continue;
		if (key === "set-cookie") {
			result[key] = [String(result[key]), value];
			continue;
		}
		result[key] = value;
	}
	return result;
}
