import { expect, it } from "vitest";
import { readSearch, writeUrl } from "./search.ts";

it("proto", () => {
	const record = readSearch("?__proto__=1&constructor=2&prototype=3&ok=4");
	expect(Object.getPrototypeOf(record)).toBe(null);
	expect(Object.keys(record)).toEqual(["ok"]);
	expect(record.ok).toBe("4");
	const input = Object.create(null) as Record<string, string>;
	input["__proto__"] = "1";
	input["constructor"] = "2";
	input["prototype"] = "3";
	input.ok = "4";
	expect(writeUrl({ path: "/p", search: input })).toBe("/p?ok=4");
});

it("empty", () => {
	expect(writeUrl({ path: "/p", search: { a: "" } })).toBe("/p?a=");
	expect(writeUrl({ path: "/p", search: { a: null, b: undefined, c: [] } })).toBe("/p");
});

it("sort", () => {
	expect(writeUrl({ path: "/p", search: { "b b": "2 2", a: "1 1" } })).toBe("/p?a=1%201&b%20b=2%202");
});

it("repeat", () => {
	expect(writeUrl({ path: "/p", search: { a: ["2", "1"] } })).toBe("/p?a=2&a=1");
});

it("empty hash", () => {
	expect(writeUrl({ path: "/p", hash: "" })).toBe("/p");
	expect(writeUrl({ path: "/p", hash: "top" })).toBe("/p#top");
});

it("read shapes", () => {
	expect(readSearch("")).toEqual({});
	expect(readSearch("?")).toEqual({});
	expect(readSearch("?flag&a=1&&b=")).toEqual({ flag: "", a: "1", b: "" });
	expect(readSearch("?tag=a&x=1&tag=b&tag=c")).toEqual({ tag: ["a", "b", "c"], x: "1" });
	expect(readSearch("?q=a%20b")).toEqual({ q: "a%20b" });
});
