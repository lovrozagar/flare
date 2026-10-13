import { expect, it } from "vitest";
import { branchFor } from "./plural.ts";

const keys = (...names: string[]): ReadonlySet<string> => new Set([...names, "other"]);

it("cardinal", () => {
	const branches = keys("one");
	expect(branchFor({ kind: "plural", value: 1, tag: "en", branches })).toBe("one");
	expect(branchFor({ kind: "plural", value: 2, tag: "en", branches })).toBe("other");
});

it("ordinal", () => {
	const branches = keys("one", "two", "few");
	const ordinal = (value: number): string => branchFor({ kind: "selectordinal", value, tag: "en", branches });
	expect([1, 2, 3, 4].map(ordinal)).toEqual(["one", "two", "few", "other"]);
	// An exact `=N` branch wins over the category.
	expect(branchFor({ kind: "selectordinal", value: 2, tag: "en", branches: keys("two", "=2") })).toBe("=2");
});

it("select", () => {
	const branches = keys("male", "female");
	expect(branchFor({ kind: "select", value: "female", tag: "en", branches })).toBe("female");
	expect(branchFor({ kind: "select", value: "nonbinary", tag: "en", branches })).toBe("other");
	// A category the message does not list falls back to `other`.
	expect(branchFor({ kind: "plural", value: 1, tag: "en", branches: keys() })).toBe("other");
});
