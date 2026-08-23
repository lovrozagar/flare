import type { CspDirectives } from "../server-handler/types.ts";

/* ── Types ─────────────────────────────────────────────────────────────── */

export type PermissionsPolicy = {
	accelerometer: boolean | "self" | string[];
	"browsing-topics": boolean | "self" | string[];
	camera: boolean | "self" | string[];
	geolocation: boolean | "self" | string[];
	gyroscope: boolean | "self" | string[];
	"interest-cohort": boolean | "self" | string[];
	magnetometer: boolean | "self" | string[];
	microphone: boolean | "self" | string[];
	payment: boolean | "self" | string[];
	usb: boolean | "self" | string[];
};

export interface SecurityConfig {
	"Content-Security-Policy"?: CspDirectives | string | false;
	"Cross-Origin-Opener-Policy"?: string | false;
	"Cross-Origin-Resource-Policy"?: string | false;
	"Permissions-Policy"?: Partial<PermissionsPolicy> | string | false;
	"Referrer-Policy"?: string | false;
	"Strict-Transport-Security"?: string | false;
	"X-Content-Type-Options"?: string | false;
	"X-Frame-Options"?: string | false;
	"X-Powered-By"?: string | false;
}

export interface SecurityContext {
	env: unknown;
	nonce: string;
	request: Request;
	serverContext: Record<string, unknown>;
}

/* ── Defaults ──────────────────────────────────────────────────────────── */

export const DEFAULT_CSP: Record<string, string[] | boolean> = {
	"base-uri": ["'self'"],
	"connect-src": ["'self'", "https:"],
	"default-src": ["'self'"],
	"font-src": ["'self'", "data:"],
	"img-src": ["'self'", "data:", "https:"],
	"object-src": ["'none'"],
	"script-src": ["'self'"],
	"style-src": ["'self'"],
	/* Solid 2 applies JSX `style={}` via CSSOM (`setProperty`). CSP3 nonces do
	 * not cover attribute/CSSOM writes; `style-src-attr` keeps `<style nonce>`
	 * elements tight while allowing those writes. */
	"style-src-attr": ["'unsafe-inline'"],
	"upgrade-insecure-requests": true,
	"worker-src": ["'self'"],
};

export const DEFAULT_PERMISSIONS_POLICY: PermissionsPolicy = {
	accelerometer: false,
	"browsing-topics": false,
	camera: false,
	geolocation: false,
	gyroscope: false,
	"interest-cohort": false,
	magnetometer: false,
	microphone: false,
	payment: "self",
	usb: false,
};

const DEFAULT_HEADERS: Record<string, string> = {
	"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"X-Powered-By": "flare",
	"X-XSS-Protection": "0",
};

/* Headers skipped in dev mode */
const DEV_SKIP_HEADERS = new Set(["Strict-Transport-Security", "Cross-Origin-Opener-Policy"]);

/* ── CSP builder ───────────────────────────────────────────────────────── */

export function buildCspHeader(nonce: string, overrides?: CspDirectives, isDev?: boolean): string {
	const directives: Record<string, string[] | boolean> = {};

	for (const [key, value] of Object.entries(DEFAULT_CSP)) {
		directives[key] = Array.isArray(value) ? [...value] : value;
	}

	if (isDev) {
		const connectSrc = directives["connect-src"] as string[];
		connectSrc.push("ws://localhost:*", "ws://127.0.0.1:*", "http://localhost:*", "http://127.0.0.1:*");
		const scriptSrc = directives["script-src"] as string[];
		scriptSrc.push("'unsafe-inline'", "'unsafe-eval'");
		/* Flare's own dev-dashboard overlay injects inline `style="..."` attributes; CSP3 nonces
		   do not apply to attribute styles, so 'unsafe-inline' is the only knob for dev parity. */
		const styleSrc = directives["style-src"] as string[];
		styleSrc.push("'unsafe-inline'");
		const workerSrc = directives["worker-src"] as string[];
		workerSrc.push("blob:");
	}

	if (overrides) {
		for (const [key, value] of Object.entries(overrides)) {
			if (value === undefined) continue;
			if (typeof value === "boolean") {
				directives[key] = value;
			} else if (Array.isArray(value)) {
				const existing = directives[key];
				if (Array.isArray(existing)) {
					existing.push(...value);
				} else {
					directives[key] = [...value];
				}
			}
		}
	}

	/* Skip nonce injection when the user opted into 'unsafe-inline' — per CSP Level 3,
	   a nonce makes 'unsafe-inline' inert. Do not add 'strict-dynamic' by default:
	   Chrome (crbug.com/702612) then fails to mark <link rel="modulepreload"> as
	   isLinkPreload, so Lighthouse chains every JS file. Apps that need Turnstile /
	   Stripe loaders can opt in via script-src: ["'strict-dynamic'"]. */
	const scriptSrc = directives["script-src"];
	if (Array.isArray(scriptSrc) && !scriptSrc.includes("'unsafe-inline'")) {
		scriptSrc.push(`'nonce-${nonce}'`);
	}

	const styleSrc = directives["style-src"];
	if (Array.isArray(styleSrc) && !styleSrc.includes("'unsafe-inline'")) {
		styleSrc.push(`'nonce-${nonce}'`);
	}

	if (!directives["style-src-attr"]) {
		directives["style-src-attr"] = ["'unsafe-inline'"];
	}

	const parts: string[] = [];
	for (const [key, value] of Object.entries(directives)) {
		if (value === true) {
			parts.push(key);
		} else if (Array.isArray(value)) {
			parts.push(`${key} ${value.join(" ")}`);
		}
	}

	return parts.join("; ");
}

function buildRawCspWithNonce(raw: string, nonce: string): string {
	/* Append nonce to script-src if present, otherwise append it */
	if (raw.includes("script-src")) {
		return raw.replace(/script-src\s+([^;]*)/, `script-src $1 'nonce-${nonce}'`);
	}
	return `${raw}; script-src 'nonce-${nonce}'`;
}

/* ── Permissions-Policy builder ────────────────────────────────────────── */

export function buildPermissionsPolicy(policy: Partial<PermissionsPolicy>): string {
	const parts: string[] = [];

	for (const [key, value] of Object.entries(policy)) {
		if (value === undefined) continue;
		if (value === false) {
			parts.push(`${key}=()`);
		} else if (value === true) {
			parts.push(`${key}=*`);
		} else if (value === "self") {
			parts.push(`${key}=(self)`);
		} else if (Array.isArray(value)) {
			const origins = value.map((o) => `"${o}"`).join(" ");
			parts.push(`${key}=(${origins})`);
		}
	}

	return parts.join(", ");
}

/* ── Main builder ──────────────────────────────────────────────────────── */

export interface BuildSecurityHeadersOptions {
	config?: SecurityConfig;
	isDev?: boolean;
	nonce: string;
}

export function buildSecurityHeaders(options: BuildSecurityHeadersOptions): Record<string, string> {
	const { config, isDev, nonce } = options;
	const result: Record<string, string> = {};

	/* CSP */
	const cspConfig = config?.["Content-Security-Policy"];
	if (cspConfig !== false) {
		if (typeof cspConfig === "string") {
			result["Content-Security-Policy"] = buildRawCspWithNonce(cspConfig, nonce);
		} else {
			result["Content-Security-Policy"] = buildCspHeader(
				nonce,
				typeof cspConfig === "object" ? cspConfig : undefined,
				isDev,
			);
		}
	}

	/* Permissions-Policy */
	const ppConfig = config?.["Permissions-Policy"];
	if (ppConfig !== false) {
		if (typeof ppConfig === "string") {
			result["Permissions-Policy"] = ppConfig;
		} else {
			const merged = { ...DEFAULT_PERMISSIONS_POLICY };
			if (typeof ppConfig === "object") {
				Object.assign(merged, ppConfig);
			}
			result["Permissions-Policy"] = buildPermissionsPolicy(merged);
		}
	}

	/* Simple string headers */
	for (const [key, defaultValue] of Object.entries(DEFAULT_HEADERS)) {
		if (key === "Permissions-Policy") continue;

		if (isDev && DEV_SKIP_HEADERS.has(key)) continue;

		const override = config?.[key as keyof SecurityConfig];
		if (override === false) continue;
		if (typeof override === "string") {
			result[key] = override;
		} else {
			result[key] = defaultValue;
		}
	}

	return result;
}
