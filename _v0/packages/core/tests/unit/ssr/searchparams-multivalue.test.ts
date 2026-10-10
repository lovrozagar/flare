import { describe, expect, it } from "vitest";
import { parseSearchParams } from "../../../src/url/index.ts";

describe("parseSearchParams preserves multi-value query params", () => {
	it("preserves all duplicate key values as array", () => {
		const url = new URL("http://localhost/?tag=a&tag=b&tag=c");
		const result = parseSearchParams(url.searchParams);
		expect(result.tag).toEqual(["a", "b", "c"]);
	});

	it("single value keys remain strings", () => {
		const url = new URL("http://localhost/?name=john&age=30");
		const result = parseSearchParams(url.searchParams);
		expect(result.name).toBe("john");
		expect(result.age).toBe("30");
	});

	it("mixed single and multi-value params", () => {
		const url = new URL("http://localhost/?q=search&tag=a&tag=b&page=1");
		const result = parseSearchParams(url.searchParams);
		expect(result.q).toBe("search");
		expect(result.tag).toEqual(["a", "b"]);
		expect(result.page).toBe("1");
	});

	it("empty search params returns empty object", () => {
		const url = new URL("http://localhost/");
		const result = parseSearchParams(url.searchParams);
		expect(result).toEqual({});
	});

	it("two duplicate values become array of 2", () => {
		const url = new URL("http://localhost/?color=red&color=blue");
		const result = parseSearchParams(url.searchParams);
		expect(result.color).toEqual(["red", "blue"]);
	});

	it("handles empty string values", () => {
		const url = new URL("http://localhost/?key=&key=val");
		const result = parseSearchParams(url.searchParams);
		expect(result.key).toEqual(["", "val"]);
	});
});
