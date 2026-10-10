/**
 * @vitest-environment node
 *
 * S2: Custom head attributes must block on* event handlers.
 * The regex filter allows valid alphanumeric attr names but must
 * explicitly reject event handler attributes (onload, onerror, etc).
 */
import { describe, expect, it } from "vitest";
import { renderHeadToHtml } from "../../../src/ssr/head.ts";

const NONCE = "test-nonce";

describe("custom head on* event handler injection", () => {
	const eventHandlers = ["onload", "onerror", "onclick", "onfocus", "onblur", "onmouseover", "onbeforeinput"];

	describe("custom meta tags", () => {
		for (const handler of eventHandlers) {
			it(`blocks ${handler} attribute on meta`, () => {
				const html = renderHeadToHtml(
					{
						custom: {
							meta: [{ content: "test", name: "safe", [handler]: "alert(1)" }],
						},
					},
					NONCE,
				);
				expect(html).toContain('name="safe"');
				expect(html).not.toContain(handler);
				expect(html).not.toContain("alert(1)");
			});
		}
	});

	describe("custom link tags", () => {
		for (const handler of eventHandlers) {
			it(`blocks ${handler} attribute on link`, () => {
				const html = renderHeadToHtml(
					{
						custom: {
							links: [{ href: "/style.css", rel: "stylesheet", [handler]: "alert(1)" }],
						},
					},
					NONCE,
				);
				expect(html).toContain('rel="stylesheet"');
				expect(html).not.toContain(handler);
				expect(html).not.toContain("alert(1)");
			});
		}
	});

	it("allows safe data- attributes", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					meta: [{ content: "test", "data-testid": "foo", name: "safe" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('data-testid="foo"');
	});

	it("allows safe aria- attributes", () => {
		const html = renderHeadToHtml(
			{
				custom: {
					links: [{ "aria-label": "link", href: "/x", rel: "stylesheet" }],
				},
			},
			NONCE,
		);
		expect(html).toContain('aria-label="link"');
	});
});
