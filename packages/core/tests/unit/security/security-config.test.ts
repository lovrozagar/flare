import { describe, expect, it } from "vitest";
import {
	buildPermissionsPolicy,
	buildSecurityHeaders,
	DEFAULT_CSP,
	DEFAULT_PERMISSIONS_POLICY,
} from "../../../src/security/index.ts";

describe("buildSecurityHeaders()", () => {
	it("returns all default headers when no config", () => {
		const headers = buildSecurityHeaders({ nonce: "abc123" });

		expect(headers["Content-Security-Policy"]).toContain("'nonce-abc123'");
		expect(headers["Content-Security-Policy"]).toContain("'self'");
		expect(headers["Content-Security-Policy"]).not.toContain("strict-dynamic");
		expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
		expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
		expect(headers["Permissions-Policy"]).toBeDefined();
		expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
		expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains; preload");
		expect(headers["X-Content-Type-Options"]).toBe("nosniff");
		expect(headers["X-Frame-Options"]).toBe("DENY");
		expect(headers["X-Powered-By"]).toBe("flare");
	});

	it("merges structured CSP with defaults", () => {
		const headers = buildSecurityHeaders({
			config: {
				"Content-Security-Policy": {
					"img-src": ["https://cdn.example.com"],
				},
			},
			nonce: "abc",
		});

		const csp = headers["Content-Security-Policy"];
		expect(csp).toContain("img-src 'self' data: https: https://cdn.example.com");
		expect(csp).toContain("'nonce-abc'");
	});

	it("passes raw string CSP through and appends nonce", () => {
		const headers = buildSecurityHeaders({
			config: {
				"Content-Security-Policy": "default-src 'self'; script-src 'self'",
			},
			nonce: "xyz",
		});

		expect(headers["Content-Security-Policy"]).toBe("default-src 'self'; script-src 'self' 'nonce-xyz'");
	});

	it("disables individual header with false", () => {
		const headers = buildSecurityHeaders({
			config: {
				"X-Frame-Options": false,
				"X-Powered-By": false,
			},
			nonce: "abc",
		});

		expect(headers["X-Powered-By"]).toBeUndefined();
		expect(headers["X-Frame-Options"]).toBeUndefined();
		expect(headers["X-Content-Type-Options"]).toBe("nosniff");
	});

	it("disables CSP with false", () => {
		const headers = buildSecurityHeaders({
			config: { "Content-Security-Policy": false },
			nonce: "abc",
		});

		expect(headers["Content-Security-Policy"]).toBeUndefined();
	});

	it("overrides string headers", () => {
		const headers = buildSecurityHeaders({
			config: {
				"Cross-Origin-Opener-Policy": "same-origin",
				"Referrer-Policy": "no-referrer",
			},
			nonce: "abc",
		});

		expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
		expect(headers["Referrer-Policy"]).toBe("no-referrer");
	});

	it("skips HSTS and COOP in dev mode", () => {
		const headers = buildSecurityHeaders({ isDev: true, nonce: "abc" });

		expect(headers["Strict-Transport-Security"]).toBeUndefined();
		expect(headers["Cross-Origin-Opener-Policy"]).toBeUndefined();
	});

	it("loosens CSP in dev mode", () => {
		const headers = buildSecurityHeaders({ isDev: true, nonce: "abc" });
		const csp = headers["Content-Security-Policy"];

		expect(csp).toContain("ws://localhost:*");
		expect(csp).toContain("'unsafe-inline'");
		expect(csp).toContain("'unsafe-eval'");
	});
});

describe("buildPermissionsPolicy()", () => {
	it("serializes false as =()", () => {
		expect(buildPermissionsPolicy({ camera: false })).toContain("camera=()");
	});

	it("serializes true as =*", () => {
		expect(buildPermissionsPolicy({ camera: true })).toContain("camera=*");
	});

	it("serializes 'self' as =(self)", () => {
		expect(buildPermissionsPolicy({ payment: "self" })).toContain("payment=(self)");
	});

	it("serializes string[] as origin list", () => {
		const result = buildPermissionsPolicy({
			camera: ["https://a.com", "https://b.com"],
		});
		expect(result).toContain('camera=("https://a.com" "https://b.com")');
	});

	it("renders default policy", () => {
		const result = buildPermissionsPolicy(DEFAULT_PERMISSIONS_POLICY);

		expect(result).toContain("camera=()");
		expect(result).toContain("microphone=()");
		expect(result).toContain("payment=(self)");
		expect(result).toContain("geolocation=()");
	});
});

describe("DEFAULT_CSP", () => {
	it("has expected default directives", () => {
		expect(DEFAULT_CSP["default-src"]).toEqual(["'self'"]);
		expect(DEFAULT_CSP["script-src"]).toEqual(["'self'"]);
		expect(DEFAULT_CSP["object-src"]).toEqual(["'none'"]);
		expect(DEFAULT_CSP["upgrade-insecure-requests"]).toBe(true);
	});
});
