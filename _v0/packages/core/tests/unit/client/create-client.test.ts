import { describe, expect, it } from "vitest";
import { createClient } from "../../../src/client/index.ts";
import { createRouter } from "../../../src/router-config/index.ts";
import { createTreeNode } from "../../../src/router-primitives/index.ts";

describe("createClient()", () => {
	const router = createRouter({
		layouts: {},
		routeTree: createTreeNode(),
	});

	it("does not throw", () => {
		expect(() => createClient(router)).not.toThrow();
	});

	it("accepts a function returning router", () => {
		expect(() => createClient(() => router)).not.toThrow();
	});

	it("onReady returns chainable builder", () => {
		const builder = createClient(router).onReady(() => {});
		expect(builder).toBeDefined();
	});

	it("onHydrated returns chainable builder", () => {
		const builder = createClient(router).onHydrated(() => {});
		expect(builder).toBeDefined();
	});

	it("onIdle returns chainable builder", () => {
		const builder = createClient(router).onIdle(() => {});
		expect(builder).toBeDefined();
	});

	it("onInteraction returns chainable builder", () => {
		const builder = createClient(router).onInteraction(() => {});
		expect(builder).toBeDefined();
	});

	it("all methods chainable in any order", () => {
		const builder = createClient(router)
			.onHydrated(() => {})
			.onIdle(() => {})
			.onInteraction(() => {})
			.onReady(() => {});
		expect(builder).toBeDefined();
	});
});
