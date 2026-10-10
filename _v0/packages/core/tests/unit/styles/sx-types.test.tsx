/** @vitest-environment jsdom */

/**
 * Type-level tests for Sx and ClassValue.
 * Runtime assertions are thin — the real value is tsc catching bad shapes.
 */

import { describe, expect, it } from "vitest";
import type { ClassValue, Sx } from "../../../src/styles/sx-types.ts";

/* Flat CSS properties */
const flatSx: Sx = { color: "red", fontSize: 16, lineHeight: 1.5 };

/* Nested pseudo/combinator selectors */
const nestedSx: Sx = {
	"& > span": { display: "block" },
	"&::before": { content: '""' },
	"&:hover": { color: "darkblue" },
	color: "blue",
};

/* At-rules */
const atRuleSx: Sx = {
	"@media (max-width: 768px)": { fontSize: 14 },
	"@supports (display: grid)": { display: "grid" },
	color: "green",
};

/* variants block */
const variantsSx: Sx = {
	color: "black",
	variants: {
		size: {
			lg: { fontSize: 24 },
			sm: { fontSize: 12 },
		},
	},
};

/* ClassValue shapes */
const cv1: ClassValue = "foo";
const cv2: ClassValue = false;
const cv3: ClassValue = null;
const cv4: ClassValue = undefined;
const cv5: ClassValue = ["a", false, null, undefined, ["nested"]];

describe("Sx type", () => {
	it("flat properties are valid Sx", () => {
		expect(flatSx.color).toBe("red");
		expect(flatSx.fontSize).toBe(16);
	});

	it("nested & selectors are valid Sx", () => {
		expect(nestedSx["&:hover"]).toBeDefined();
	});

	it("at-rules are valid Sx", () => {
		expect(atRuleSx["@media (max-width: 768px)"]).toBeDefined();
	});

	it("variants block is valid Sx", () => {
		expect(variantsSx.variants?.size?.sm?.fontSize).toBe(12);
	});
});

describe("ClassValue type", () => {
	it("accepts string", () => {
		expect(cv1).toBe("foo");
	});

	it("accepts falsy values", () => {
		expect(cv2).toBe(false);
		expect(cv3).toBeNull();
		expect(cv4).toBeUndefined();
	});

	it("accepts nested arrays", () => {
		expect(Array.isArray(cv5)).toBe(true);
	});
});

describe("JSX augmentation: sx prop", () => {
	it("accepts sx prop on div without TS error", () => {
		/* If tsc passes this file, the JSX augmentation is working */
		const el = <div sx={{ "&:hover": { color: "blue" }, color: "red" }} />;
		expect(el).toBeDefined();
	});

	it("accepts class as ClassValue array on div without TS error", () => {
		const active = true;
		const el = <div class={["base", active && "active", false]} />;
		expect(el).toBeDefined();
	});

	it("accepts sx prop on svg without TS error", () => {
		const el = <svg sx={{ fill: "red" }} />;
		expect(el).toBeDefined();
	});
});
