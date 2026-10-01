import { afterEach, describe, expect, it } from "vitest";
import { mergeClassList } from "../../../src/styles/cn.ts";
import { clearScopedStyles, cn } from "../../../src/styles/index.ts";

afterEach(() => {
	clearScopedStyles();
});

describe("cn — plain strings", () => {
	it("single string → returned as-is", () => {
		expect(cn("foo")).toBe("foo");
	});

	it("multiple strings → space-joined", () => {
		expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
	});

	it("trims individual strings", () => {
		expect(cn("  foo  ", "bar")).toBe("foo bar");
	});
});

describe("cn — falsy values", () => {
	it("false filtered out", () => {
		expect(cn("foo", false, "bar")).toBe("foo bar");
	});

	it("null filtered out", () => {
		expect(cn("foo", null, "bar")).toBe("foo bar");
	});

	it("undefined filtered out", () => {
		expect(cn("foo", undefined, "bar")).toBe("foo bar");
	});

	it("empty string filtered out", () => {
		expect(cn("foo", "", "bar")).toBe("foo bar");
	});

	it("all falsy → empty string", () => {
		expect(cn(false, null, undefined)).toBe("");
	});
});

describe("cn — object map", () => {
	it("truthy values → key included", () => {
		expect(cn({ active: true, disabled: false })).toBe("active");
	});

	it("all false → empty string", () => {
		expect(cn({ a: false, b: false })).toBe("");
	});

	it("mixed truthy → only truthy keys", () => {
		expect(cn({ bar: false, baz: true, foo: true })).toBe("baz foo");
	});
});

describe("cn — nested arrays", () => {
	it("flat array → flattened", () => {
		expect(cn(["foo", "bar"])).toBe("foo bar");
	});

	it("nested arrays → recursively flattened", () => {
		expect(cn(["foo", ["bar", ["baz"]]])).toBe("foo bar baz");
	});

	it("array with falsy → filtered", () => {
		expect(cn(["foo", false, null, "bar"])).toBe("foo bar");
	});
});

describe("cn — external tokens are not deduped", () => {
	it("duplicate non-tailwind names stay", () => {
		expect(cn("foo", "foo")).toBe("foo foo");
	});

	it("same external class in a nested array stays", () => {
		expect(cn("a", ["a", "b"])).toBe("a a b");
	});

	it("later duplicate external class is kept", () => {
		expect(cn("a", "b", "a")).toBe("a b a");
	});
});

describe("cn — tailwind conflict merge", () => {
	it("later padding-x wins", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
	});

	it("later padding wins", () => {
		expect(cn("p-2", "p-8")).toBe("p-8");
	});

	it("same utility collapses to one token", () => {
		expect(cn("flex", "flex")).toBe("flex");
	});

	it("keeps non-conflicting variants in source order", () => {
		expect(cn("p-2", "md:p-8")).toBe("p-2 md:p-8");
	});

	it("keeps hashed atomics and drops the conflicting utility", () => {
		expect(cn("px-2", "a1-deadbeef", "px-4")).toBe("a1-deadbeef px-4");
		expect(cn("px-2", "sx-box", "px-4")).toBe("sx-box px-4");
		expect(cn("px-2", "flare-rt-abc", "px-4")).toBe("flare-rt-abc px-4");
	});

	it("keeps group and peer markers", () => {
		expect(cn("group", "px-2", "peer/name", "px-4")).toBe("group peer/name px-4");
	});

	it("mergeClassList matches cn on one string", () => {
		expect(mergeClassList("px-2 px-4")).toBe("px-4");
		expect(mergeClassList("px-2 a1-deadbeef px-4")).toBe("a1-deadbeef px-4");
	});
});

describe("cn — mixed inputs", () => {
	it("strings + objects + arrays all combine correctly", () => {
		const result = cn("base", { active: true, hidden: false }, ["extra", false]);
		expect(result).toBe("base active extra");
	});

	it("empty inputs → empty string (no leading/trailing whitespace)", () => {
		expect(cn()).toBe("");
		expect(cn("")).toBe("");
	});
});
