import { createComponent } from "solid-js";
import { expect, it } from "vitest";
import { createRouter } from "./create-router.ts";
import { RouterContext, useRouter } from "./context.ts";

it("value", () => {
	const router = createRouter({ layouts: {}, routeTree: [] });
	let seen: unknown;
	const view = createComponent(RouterContext, {
		value: router,
		get children() {
			seen = useRouter();
			return null;
		},
	});
	(view as () => unknown)();
	expect(seen).toBe(router);
});

it("outside", () => {
	expect(() => useRouter()).toThrow(/outside provider/);
});
