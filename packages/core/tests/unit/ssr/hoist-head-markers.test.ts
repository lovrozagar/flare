import { describe, expect, it } from "vitest";
import { hoistHydrationHeadMarkers } from "../../../src/ssr/hoist-head-markers.ts";

describe("hoistHydrationHeadMarkers", () => {
	it("moves Solid marker region to the start of head", () => {
		const html =
			`<!DOCTYPE html><html><head>` +
			`<script type="module" src="/@vite/client"></script>` +
			`<meta name="csp-nonce" nonce="n">` +
			`<!--$--><style _hk=1>x</style><!--/-->` +
			`<!--$--><style _hk=2>y</style><!--/-->` +
			`<title>t</title>` +
			`</head><body></body></html>`;
		const out = hoistHydrationHeadMarkers(html);
		const inner = out.slice(out.indexOf("<head>") + 6, out.indexOf("</head>"));
		expect(inner.startsWith("<!--$-->")).toBe(true);
		expect(inner).toContain('src="/@vite/client"');
		expect(inner).toContain("<title>t</title>");
		expect(inner.indexOf("<!--$-->")).toBeLessThan(inner.indexOf("/@vite/client"));
	});

	it("is a no-op when markers already lead", () => {
		const html = `<html><head><!--$--><style></style><!--/--><meta></head></html>`;
		expect(hoistHydrationHeadMarkers(html)).toBe(html);
	});

	it("is a no-op without markers", () => {
		const html = `<html><head><meta></head></html>`;
		expect(hoistHydrationHeadMarkers(html)).toBe(html);
	});
});
