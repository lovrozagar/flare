import { createComponent, OBSERVE } from "solid-js";
import { renderToString, type JSX } from "@solidjs/web";
import { expect, it } from "vitest";
import { RouterContext } from "../../../shared/router/context.ts";
import { createRouter } from "../../../shared/router/create-router.ts";
import { DirectionProvider, useDirection } from "./provider.tsx";

// The provider on Solid's server build. The client rows are provider.test.tsx.
const router = createRouter({ layouts: {}, routeTree: [], direction: { defaultDir: "rtl" } });

function tree(locale: string | undefined, child: () => JSX.Element): () => JSX.Element {
	const props = locale === undefined ? {} : { locale };
	return () =>
		createComponent(RouterContext, {
			value: router,
			get children() {
				return createComponent(DirectionProvider, {
					...props,
					get children() {
						return child();
					},
				});
			},
		});
}

it("server set", () => {
	const render = tree("ar", () => {
		useDirection().setDirection("ltr");
		return "child";
	});
	expect(() => renderToString(render)).toThrow(/server/);
});

// The render seeds the signal from the locale and calls no setter (B90).
it("server pure", () => {
	const codes: string[] = [];
	const diagnostics = OBSERVE?.diagnostics;
	if (diagnostics === undefined) throw new Error("diagnostics");
	const stop = diagnostics.subscribe((event) => void codes.push(event.code));
	const english = renderToString(tree("en", () => useDirection().direction()));
	const none = renderToString(tree(undefined, () => useDirection().direction()));
	stop();
	expect([english, none]).toEqual(["ltr", "rtl"]);
	expect(codes).not.toContain("SERVER_WRITE");
});

it("outside", () => {
	expect(() => renderToString(() => useDirection().direction())).toThrow(/DirectionProvider/);
});
