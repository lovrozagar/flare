import { expect, it } from "vitest";
import { escapeSource } from "./escape.ts";

it("quote in a path", () => {
	const name = 'say-"hi".tsx';
	const source = `const path = "${escapeSource(name)}";`;
	expect(Function(`${source} return path;`)()).toBe(name);
});

it("backslash", () => {
	const segment = "a\\b";
	const escaped = escapeSource(segment);
	expect(escaped.includes("\b")).toBe(false);
	expect(Function(`return "${escaped}"`)()).toBe(segment);
});
