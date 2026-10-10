import { describe, expect, it } from "vitest";
import { isFlareMount } from "../../../src/mount/index.ts";

describe("isFlareMount()", () => {
	it("returns true for valid mount config", () => {
		expect(isFlareMount({ fetch: () => new Response(), prefix: "/api" })).toBe(true);
	});

	it("returns false for null/undefined", () => {
		expect(isFlareMount(null)).toBe(false);
		expect(isFlareMount(undefined)).toBe(false);
	});

	it("returns false for non-object", () => {
		expect(isFlareMount("string")).toBe(false);
		expect(isFlareMount(42)).toBe(false);
	});

	it("returns false when fetch is not a function", () => {
		expect(isFlareMount({ fetch: "not-a-fn", prefix: "/api" })).toBe(false);
	});

	it("returns false when prefix is missing", () => {
		expect(isFlareMount({ fetch: () => new Response() })).toBe(false);
	});

	it("returns false for empty object", () => {
		expect(isFlareMount({})).toBe(false);
	});
});
