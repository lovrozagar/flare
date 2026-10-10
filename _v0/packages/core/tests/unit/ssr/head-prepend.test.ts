import { describe, expect, it } from "vitest";
import { markSolidHeadStart, moveHeadPrependsAfterSolid } from "../../../src/ssr/head-prepend.ts";

/* Stand-in for Vite's transformIndexHtml head-prepend injection. */
const vitePrepend = (html: string) =>
	html.replace(/<head([^>]*)>/, '<head$1><script type="module" src="/@vite/client"></script>');

describe("head-prepend", () => {
	it("keeps Solid's head children first and in order, static elements included", () => {
		const ssr =
			'<!DOCTYPE html><html><head lang="x"><meta charset="utf-8"><title>t</title>' +
			"<!--$--><script>theme()</script><!--/--><style>flare</style></head><body></body></html>";
		const out = moveHeadPrependsAfterSolid(vitePrepend(markSolidHeadStart(ssr)));
		expect(out).toBe(
			'<!DOCTYPE html><html><head lang="x"><meta charset="utf-8"><title>t</title>' +
				'<!--$--><script>theme()</script><!--/--><style>flare</style><script type="module" src="/@vite/client"></script>' +
				"</head><body></body></html>",
		);
	});

	it("drops the mark when nothing was prepended", () => {
		const ssr = "<html><head><meta></head><body></body></html>";
		expect(moveHeadPrependsAfterSolid(markSolidHeadStart(ssr))).toBe(ssr);
	});

	it("leaves unmarked HTML alone", () => {
		const html = '<html><head><script src="/@vite/client"></script><meta></head></html>';
		expect(moveHeadPrependsAfterSolid(html)).toBe(html);
	});

	it("does not mistake <header> for <head>", () => {
		const html = "<html><body><header>x</header></body></html>";
		expect(markSolidHeadStart(html)).toBe(html);
	});
});
