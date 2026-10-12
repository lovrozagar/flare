import { expect, it } from "vitest";
import { stateScript } from "../render/state.ts";
import { fromSentinel, NONCE_SENTINEL, toSentinel } from "./nonce.ts";

const state = (nonce: string, data: unknown = { text: "abc" }): string =>
	stateScript({
		matches: [{ id: "p", params: {}, search: {}, data, preloader: undefined, head: undefined, error: undefined }],
		nonce,
	});

it("attribute", () => {
	expect(toSentinel('<script nonce="abc">a()</script>', "abc")).toBe(`<script nonce="${NONCE_SENTINEL}">a()</script>`);
});

it("quotes", () => {
	expect(toSentinel("<style nonce='abc'>p{}</style>", "abc")).toBe(`<style nonce='${NONCE_SENTINEL}'>p{}</style>`);
});

// Only nonce attributes and the state field change. Text that equals the nonce is someone's content.
it("text", () => {
	expect(toSentinel("<p>abc</p>", "abc")).toBe("<p>abc</p>");
});

it("other attr", () => {
	expect(toSentinel('<p id="abc" data-nonce="abc">x</p>', "abc")).toBe('<p id="abc" data-nonce="abc">x</p>');
	// A nonce attribute holding another value is left alone.
	expect(toSentinel('<script nonce="zzz"></script>', "abc")).toBe('<script nonce="zzz"></script>');
});

// The state's own `nonce` field changes. Loader data that happens to hold the nonce does not.
it("state field", () => {
	const stored = toSentinel(state("abc", { nonce: "abc" }), "abc");
	expect(stored).toBe(state(NONCE_SENTINEL, { nonce: "abc" }));
	expect(stored).toContain('"data":{"nonce":"abc"}');
});

it("round trip", () => {
	const body = `<html><head><style nonce="abc"></style></head><body>abc${state("abc")}</body></html>`;
	const stored = toSentinel(body, "abc");
	expect(stored).not.toContain('nonce="abc"');
	expect(fromSentinel(stored, "def")).toBe(
		`<html><head><style nonce="def"></style></head><body>abc${state("def")}</body></html>`,
	);
	// Only the sentinel is rewritten. Another nonce value stays.
	expect(fromSentinel('<script nonce="zzz"></script>', "def")).toBe('<script nonce="zzz"></script>');
});

// A hit whose policy has no nonce, a string or `false` CSP, sends no nonce attribute and an empty state field (B68).
it("strip", () => {
	const stored = toSentinel(`<style nonce="abc"></style><p>x</p>${state("abc")}`, "abc");
	expect(fromSentinel(stored, "")).toBe(`<style></style><p>x</p>${state("")}`);
	expect(fromSentinel("<p>no state</p>", "def")).toBe("<p>no state</p>");
});
