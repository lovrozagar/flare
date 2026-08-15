import { describe, expect, it } from "vitest";
import { buildHeadPrefix } from "../../../src/ssr/head-prefix.ts";

const NONCE = "abc123";

describe("buildHeadPrefix — first-paint order", () => {
	it("emits theme script before modulepreload and stylesheet", () => {
		const html = buildHeadPrefix({
			modulePreloads: {
				css: ["/assets/app.css"],
				js: ["/assets/client.js"],
			},
			nonce: NONCE,
			resolvedHead: {},
		});

		const themeIdx = html.indexOf("flare.theme");
		const preloadIdx = html.indexOf('rel="modulepreload"');
		const cssIdx = html.indexOf('rel="stylesheet"');

		expect(themeIdx).toBeGreaterThan(0);
		expect(preloadIdx).toBeGreaterThan(themeIdx);
		expect(cssIdx).toBeGreaterThan(themeIdx);
	});

	it("theme script is nonce'd and matches the request nonce", () => {
		const html = buildHeadPrefix({ nonce: NONCE, resolvedHead: {} });
		expect(html).toContain(`<script nonce="${NONCE}">`);
		expect(html).toContain("flare.theme");
	});

	it("injects color-scheme CSS so first land is not blocked by style-src CSPOM", () => {
		const html = buildHeadPrefix({ nonce: NONCE, resolvedHead: {} });
		expect(html).toContain(`<style nonce="${NONCE}">`);
		expect(html).toContain("color-scheme:light");
		expect(html).toContain("[data-theme=dark]");
		expect(html.indexOf("flare.theme")).toBeLessThan(html.indexOf("color-scheme:light"));
	});

	it("uses custom theme attribute in color-scheme CSS", () => {
		const html = buildHeadPrefix({
			nonce: NONCE,
			resolvedHead: {},
			theme: { attribute: "data-mode" },
		});
		expect(html).toContain("[data-mode=dark]");
		expect(html).toContain("data-mode");
	});

	it("injects default viewport when the app omitted one", () => {
		const html = buildHeadPrefix({ nonce: NONCE, resolvedHead: {} });
		expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
	});

	it("does not duplicate viewport when the app set one", () => {
		const html = buildHeadPrefix({
			nonce: NONCE,
			resolvedHead: { meta: { viewport: "width=device-width, initial-scale=1" } },
		});
		expect(html.match(/name="viewport"/g) ?? []).toHaveLength(0);
	});

	it("injects direction script when configured, still before modulepreload", () => {
		const html = buildHeadPrefix({
			direction: { defaultDir: "ltr" },
			modulePreloads: { css: [], js: ["/assets/client.js"] },
			nonce: NONCE,
			resolvedHead: {},
		});
		expect(html).toContain("flare.dir");
		expect(html.indexOf("flare.dir")).toBeLessThan(html.indexOf('rel="modulepreload"'));
	});

	it("injects locale script when configured", () => {
		const html = buildHeadPrefix({
			locale: { defaultLocale: "en", locales: ["en"] },
			nonce: NONCE,
			resolvedHead: {},
		});
		expect(html).toContain("setAttribute");
		expect(html).toContain('"en"');
	});

	it("escapes nonce in attributes", () => {
		const html = buildHeadPrefix({ nonce: `a"onclick="alert(1)`, resolvedHead: {} });
		expect(html).not.toContain('nonce="a"onclick="alert(1)"');
		expect(html).toContain("a&quot;onclick=&quot;alert(1)");
	});
});
