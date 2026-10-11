import { defaultHeaders } from "./defaults.ts";

const ORDER = [
	"default-src",
	"script-src",
	"style-src",
	"style-src-elem",
	"style-src-attr",
	"base-uri",
	"object-src",
	"img-src",
	"font-src",
	"connect-src",
	"worker-src",
] as const;

const FEATURES = [
	"accelerometer",
	"browsing-topics",
	"camera",
	"geolocation",
	"gyroscope",
	"interest-cohort",
	"magnetometer",
	"microphone",
	"payment",
	"usb",
] as const;

export type CspDirectives = Partial<Record<(typeof ORDER)[number], readonly string[]>>;

export type PermissionMap = Partial<Record<(typeof FEATURES)[number], true | readonly string[]>>;

type CspSetting = false | string | CspDirectives;

export function buildCsp(input: { url: string; dev?: boolean; csp?: CspSetting; permissions?: PermissionMap }): {
	headers: Headers;
	nonce: string;
} {
	const headers = defaultHeaders(input.url);
	if (input.dev === true) {
		headers.delete("strict-transport-security");
		headers.delete("cross-origin-opener-policy");
	}
	const nonce = policyNonce(input.csp);
	const text = policyText(input, nonce);
	if (text !== "") headers.set("content-security-policy", text);
	headers.set("permissions-policy", permissionHeader(input.permissions));
	return { headers, nonce };
}

function policyNonce(csp: CspSetting | undefined): string {
	if (csp === false || typeof csp === "string") return "";
	return randomNonce();
}

function policyText(input: { url: string; dev?: boolean; csp?: CspSetting }, nonce: string): string {
	if (input.csp === false) return "";
	if (typeof input.csp === "string") return input.csp;
	return directivePolicy({ url: input.url, dev: input.dev === true, user: input.csp }, nonce);
}

function randomNonce(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	let hex = "";
	for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
	return hex;
}

function directivePolicy(input: { url: string; dev: boolean; user: CspDirectives | undefined }, nonce: string): string {
	const lists = baseLists();
	if (input.user !== undefined) applyUser(lists, input.user);
	if (input.dev) applyDev(lists);
	lists["script-src"] = [...lists["script-src"], `'nonce-${nonce}'`];
	lists["style-src-elem"] = [...lists["style-src-elem"], `'nonce-${nonce}'`];
	const parts = ORDER.map((name) => `${name} ${lists[name].join(" ")}`);
	if (new URL(input.url).protocol === "https:") parts.push("upgrade-insecure-requests");
	return parts.join("; ");
}

function baseLists(): Record<(typeof ORDER)[number], string[]> {
	return {
		"default-src": ["'self'"],
		"script-src": ["'self'"],
		"style-src": ["'self'"],
		"style-src-elem": ["'self'"],
		"style-src-attr": ["'unsafe-inline'"],
		"base-uri": ["'self'"],
		"object-src": ["'none'"],
		"img-src": ["'self'", "data:", "https:"],
		"font-src": ["'self'", "data:", "https:"],
		"connect-src": ["'self'", "https:"],
		"worker-src": ["'self'"],
	};
}

function applyUser(lists: Record<(typeof ORDER)[number], string[]>, user: CspDirectives): void {
	for (const name of ORDER) {
		const value = user[name];
		if (value !== undefined) lists[name] = [...value];
	}
	const styleSrc = user["style-src"];
	if (styleSrc !== undefined && user["style-src-elem"] === undefined) lists["style-src-elem"] = [...styleSrc];
}

function applyDev(lists: Record<(typeof ORDER)[number], string[]>): void {
	lists["connect-src"] = [
		...lists["connect-src"],
		"ws://localhost:*",
		"ws://127.0.0.1:*",
		"http://localhost:*",
		"http://127.0.0.1:*",
	];
	lists["script-src"] = [...lists["script-src"], "'unsafe-eval'"];
	lists["worker-src"] = [...lists["worker-src"], "blob:"];
}

function permissionHeader(permissions: PermissionMap | undefined): string {
	return FEATURES.map((feature) => token(feature, permissions?.[feature])).join(",");
}

function token(feature: (typeof FEATURES)[number], value: true | readonly string[] | undefined): string {
	if (value === true) return `${feature}=*`;
	if (Array.isArray(value)) return allow(feature, value);
	return `${feature}=()`;
}

function allow(feature: string, origins: readonly string[]): string {
	for (const origin of origins) {
		if (origin.includes('"')) throw new Error(origin);
	}
	return `${feature}=(${origins.map((origin) => `"${origin}"`).join(" ")})`;
}
