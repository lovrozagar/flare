import { expect, it, vi } from "vitest";
import { buildCsp, type CspDirectives, type PermissionMap } from "./csp.ts";

const https = "https://example.com/";

function policy(input: {
	url?: string;
	dev?: boolean;
	csp?: false | string | CspDirectives;
	permissions?: PermissionMap;
}) {
	const result = buildCsp({ url: input.url ?? https, ...input });
	return { ...result, csp: result.headers.get("content-security-policy") ?? "" };
}

function source(csp: string, name: string): string | undefined {
	for (const part of csp.split(";")) {
		const item = part.trim();
		if (item === name) return "";
		if (item.startsWith(`${name} `)) return item.slice(name.length + 1);
	}
	return undefined;
}

it("nonce pair", () => {
	const result = policy({});
	expect(source(result.csp, "script-src")).toBe(`'self' 'nonce-${result.nonce}'`);
	expect(source(result.csp, "style-src-elem")).toBe(`'self' 'nonce-${result.nonce}'`);
	expect(source(result.csp, "style-src")).toBe("'self'");
	expect(result.csp).toContain("upgrade-insecure-requests");
});

it("style attr", () => {
	expect(source(policy({}).csp, "style-src-attr")).toBe("'unsafe-inline'");
});

it("per request", () => {
	expect(buildCsp({ url: https }).nonce).not.toBe(buildCsp({ url: https }).nonce);
});

it("string drops nonce", () => {
	const result = policy({ csp: "default-src 'none'" });
	expect(result.csp).toBe("default-src 'none'");
	expect(result.nonce).toBe("");
	expect(result.csp).not.toContain("nonce-");
});

it("false drops header", () => {
	const random = vi.spyOn(crypto, "getRandomValues");
	try {
		const result = buildCsp({ url: https, csp: false });
		expect(result.headers.has("content-security-policy")).toBe(false);
		expect(result.nonce).toBe("");
		expect(random).not.toHaveBeenCalled();
	} finally {
		random.mockRestore();
	}
});

it("length", () => {
	expect(buildCsp({ url: https }).nonce).toMatch(/^[0-9a-f]{32}$/);
});

it("dev http", () => {
	expect(policy({ url: "http://localhost/" }).csp).not.toContain("upgrade-insecure-requests");
});

it("permissions deny", () => {
	const features = [
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
	];
	expect(policy({}).headers.get("permissions-policy")).toBe(features.map((feature) => `${feature}=()`).join(","));
});

it("star", () => {
	const header = policy({ permissions: { payment: true } }).headers.get("permissions-policy") ?? "";
	expect(header).toContain("payment=*");
	expect(header).toContain("camera=()");
});

it("origin quote", () => {
	expect(() => buildCsp({ url: https, permissions: { camera: ['https://a.com"'] } })).toThrow('"');
	const header = policy({ permissions: { camera: ["https://a.com"] } }).headers.get("permissions-policy") ?? "";
	expect(header).toContain('camera=("https://a.com")');
});

it("partial keeps defaults", () => {
	const result = policy({ csp: { "img-src": ["https://cdn.example"] } });
	expect(source(result.csp, "img-src")).toBe("https://cdn.example");
	expect(source(result.csp, "script-src")).toBe(`'self' 'nonce-${result.nonce}'`);
	expect(source(result.csp, "style-src-elem")).toBe(`'self' 'nonce-${result.nonce}'`);
	expect(source(result.csp, "default-src")).toBe("'self'");
});

it("style copy", () => {
	const result = policy({ csp: { "style-src": ["'self'", "https://cdn.example"] } });
	expect(source(result.csp, "style-src")).toBe("'self' https://cdn.example");
	expect(source(result.csp, "style-src-elem")).toBe(`'self' https://cdn.example 'nonce-${result.nonce}'`);
	const kept = policy({ csp: { "style-src": ["https://a.example"], "style-src-elem": ["https://b.example"] } });
	expect(source(kept.csp, "style-src")).toBe("https://a.example");
	expect(source(kept.csp, "style-src-elem")).toBe(`https://b.example 'nonce-${kept.nonce}'`);
});

it("dev extras", () => {
	const result = policy({ dev: true });
	expect(result.headers.has("strict-transport-security")).toBe(false);
	expect(result.headers.has("cross-origin-opener-policy")).toBe(false);
	expect(result.csp).toContain("ws://localhost:*");
	expect(result.csp).toContain("ws://127.0.0.1:*");
	expect(result.csp).toContain("http://localhost:*");
	expect(result.csp).toContain("http://127.0.0.1:*");
	expect(source(result.csp, "script-src")).toContain("'unsafe-eval'");
	expect(source(result.csp, "worker-src")).toContain("blob:");
	expect(result.csp).toContain(`'nonce-${result.nonce}'`);
});
