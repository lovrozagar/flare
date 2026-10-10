import { describe, expect, it } from "vitest";
import { parseMilliseconds, parseSeconds } from "../../../src/duration/index.ts";

describe("parseSeconds", () => {
	it("passes through numbers unchanged", () => {
		expect(parseSeconds(60)).toBe(60);
		expect(parseSeconds(0)).toBe(0);
		expect(parseSeconds(3600)).toBe(3600);
	});

	it("parses seconds", () => {
		expect(parseSeconds("30s")).toBe(30);
		expect(parseSeconds("1s")).toBe(1);
		expect(parseSeconds("0s")).toBe(0);
	});

	it("parses minutes", () => {
		expect(parseSeconds("1m")).toBe(60);
		expect(parseSeconds("5m")).toBe(300);
		expect(parseSeconds("30m")).toBe(1800);
	});

	it("parses hours", () => {
		expect(parseSeconds("1h")).toBe(3600);
		expect(parseSeconds("24h")).toBe(86400);
		expect(parseSeconds("2h")).toBe(7200);
	});

	it("parses days", () => {
		expect(parseSeconds("1d")).toBe(86400);
		expect(parseSeconds("7d")).toBe(604800);
		expect(parseSeconds("30d")).toBe(2592000);
	});

	it("throws on invalid format", () => {
		expect(() => parseSeconds("abc" as never)).toThrow("Invalid duration");
		expect(() => parseSeconds("1w" as never)).toThrow("Invalid duration");
		expect(() => parseSeconds("" as never)).toThrow("Invalid duration");
		expect(() => parseSeconds("h" as never)).toThrow("Invalid duration");
		expect(() => parseSeconds("10" as never)).toThrow("Invalid duration");
	});

	it("handles large values", () => {
		expect(parseSeconds("365d")).toBe(31536000);
		expect(parseSeconds("999h")).toBe(3596400);
	});
});

describe("parseMilliseconds", () => {
	it("passes through numbers unchanged", () => {
		expect(parseMilliseconds(1000)).toBe(1000);
		expect(parseMilliseconds(0)).toBe(0);
	});

	it("converts duration strings to milliseconds", () => {
		expect(parseMilliseconds("1s")).toBe(1000);
		expect(parseMilliseconds("1m")).toBe(60000);
		expect(parseMilliseconds("1h")).toBe(3600000);
		expect(parseMilliseconds("1d")).toBe(86400000);
	});

	it("parses common cache values", () => {
		expect(parseMilliseconds("30s")).toBe(30000);
		expect(parseMilliseconds("5m")).toBe(300000);
		expect(parseMilliseconds("10m")).toBe(600000);
	});

	it("throws on invalid format", () => {
		expect(() => parseMilliseconds("bad" as never)).toThrow("Invalid duration");
	});
});
