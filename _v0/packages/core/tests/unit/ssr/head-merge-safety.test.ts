/**
 * @vitest-environment node
 *
 * S4: mergeHeadConfigs must not allow __proto__ or constructor keys
 * to corrupt the result object's prototype chain.
 */
import { describe, expect, it } from "vitest";
import { mergeHeadConfigs } from "../../../src/ssr/index.tsx";

describe("mergeHeadConfigs prototype safety", () => {
	it("filters __proto__ key from child", () => {
		const parent = { title: "Parent" };
		/* JSON.parse produces an object with __proto__ as a regular key */
		const child = JSON.parse('{"__proto__": {"polluted": true}, "title": "Child"}');
		const result = mergeHeadConfigs(parent, child);
		expect(result.title).toBe("Child");
		/* __proto__ should not appear as own property on result */
		expect(Object.hasOwn(result, "__proto__")).toBe(false);
		/* Global Object.prototype must not be polluted */
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it("filters constructor key from child", () => {
		const parent = { title: "Parent" };
		const child = JSON.parse('{"constructor": {"polluted": true}, "title": "Child"}');
		const result = mergeHeadConfigs(parent, child);
		expect(result.title).toBe("Child");
		expect(Object.hasOwn(result, "constructor")).toBe(false);
	});

	it("filters prototype key from child", () => {
		const parent = { title: "Parent" };
		const child = JSON.parse('{"prototype": {"polluted": true}, "title": "Child"}');
		const result = mergeHeadConfigs(parent, child);
		expect(result.title).toBe("Child");
		expect(Object.hasOwn(result, "prototype")).toBe(false);
	});

	it("filters __proto__ within nested object field merges", () => {
		const parent = { openGraph: { title: "Parent" } };
		const child = JSON.parse('{"openGraph": {"__proto__": {"polluted": true}, "title": "Child"}}');
		const result = mergeHeadConfigs(parent, child);
		expect(result.openGraph?.title).toBe("Child");
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});
