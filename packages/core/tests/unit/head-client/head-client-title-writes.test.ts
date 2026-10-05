import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyPerRouteHeads, clearRouteTracking, initRouteHierarchy } from "../../../src/head-client/index.ts";

/*
 * Browsers forward every document.title write to the tab strip, so a navigation that writes the
 * root layout's title before the page's flashes the wrong title in the tab.
 */
describe("applyPerRouteHeads title writes", () => {
	const writes: string[] = [];
	const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "title");

	beforeEach(() => {
		writes.length = 0;
		document.title = "Site";
		Object.defineProperty(Document.prototype, "title", {
			configurable: true,
			get() {
				return descriptor?.get?.call(this);
			},
			set(value: string) {
				writes.push(value);
				descriptor?.set?.call(this, value);
			},
		});
		initRouteHierarchy(["root"], "Site");
	});

	afterEach(() => {
		if (descriptor) Object.defineProperty(Document.prototype, "title", descriptor);
		clearRouteTracking();
	});

	const hierarchy = (page: string) => [
		{ head: { title: "Site - Home" }, matchId: "root" },
		{ head: { title: "Site - Section" }, matchId: "layout" },
		{ head: { title: `Site - ${page}` }, matchId: `page-${page}` },
	];

	it("writes the deepest route's title once", () => {
		applyPerRouteHeads(hierarchy("Products"));
		expect(writes).toEqual(["Site - Products"]);
		expect(document.title).toBe("Site - Products");
	});

	it("does not rewrite an unchanged title", () => {
		applyPerRouteHeads(hierarchy("Products"));
		writes.length = 0;
		applyPerRouteHeads(hierarchy("Products"));
		expect(writes).toEqual([]);
	});

	it("falls back to the base title once when no route sets one", () => {
		applyPerRouteHeads(hierarchy("Products"));
		writes.length = 0;
		applyPerRouteHeads([{ head: {}, matchId: "root" }]);
		expect(writes).toEqual(["Site"]);
	});
});
