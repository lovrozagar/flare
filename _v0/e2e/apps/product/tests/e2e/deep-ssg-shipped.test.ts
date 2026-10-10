import { expect, test } from "@playwright/test";

/**
 * @prod-only
 *
 * Prerendered pages ship inside the client output and are read through cache.static
 * (ASSETS binding on Workers, the client directory on Node). The server still renders the
 * response envelope: fresh nonce, CSP, Flare headers.
 */
test.describe("@prod-only SSG pages are served from the build's shipped copy", () => {
	test("static page: flare-render SSG, cache HIT, fresh nonce each request", async ({ request }) => {
		const first = await request.get("/static-pure");
		const second = await request.get("/static-pure");
		const html1 = await first.text();
		const html2 = await second.text();

		expect(first.status()).toBe(200);
		expect(first.headers()["flare-render"]).toBe("SSG");
		expect(first.headers()["flare-cache"]).toBe("HIT");
		const nonce1 = /nonce="([a-fA-F0-9]+)"/.exec(html1)?.[1];
		const nonce2 = /nonce="([a-fA-F0-9]+)"/.exec(html2)?.[1];
		expect(nonce1).toBeTruthy();
		expect(nonce1).not.toBe(nonce2);
		expect(first.headers()["content-security-policy"]).toContain(`nonce-${nonce1}`);
		expect(html1).not.toContain("__FLARE_NONCE__");
	});

	test("data request for a static page comes from the shipped copy too", async ({ request }) => {
		const page = await (await request.get("/static-pure")).text();
		const build = /self\.flare=\{"b":"([^"]+)"/.exec(page)?.[1];
		const res = await request.get(`/static-pure?_flare=${build}`, { headers: { "flare-data": "1" } });

		expect(res.headers()["content-type"]).toContain("ndjson");
		expect(res.headers()["flare-render"]).toBe("SSG");
		expect(res.headers()["flare-build"]).toBe(build);
	});
});
