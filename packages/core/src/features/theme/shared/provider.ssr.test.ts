import { createComponent, OBSERVE } from "solid-js";
import { renderToString, type JSX } from "@solidjs/web";
import { expect, it } from "vitest";
import { RouterContext } from "../../../shared/router/context.ts";
import { createRouter } from "../../../shared/router/create-router.ts";
import { ThemeProvider, useTheme } from "./provider.tsx";

// The provider on Solid's server build. The client rows are provider.test.tsx.
const router = createRouter({ layouts: {}, routeTree: [], theme: { defaultTheme: "dark" } });

function tree(child: () => JSX.Element): () => JSX.Element {
	return () =>
		createComponent(RouterContext, {
			value: router,
			get children() {
				return createComponent(ThemeProvider, {
					get children() {
						return child();
					},
				});
			},
		});
}

it("server set", () => {
	const render = tree(() => {
		useTheme().setTheme("dark");
		return "child";
	});
	expect(() => renderToString(render)).toThrow(/server/);
});

// The render seeds the signal with the default and calls no setter (B90).
it("server pure", () => {
	const codes: string[] = [];
	const diagnostics = OBSERVE?.diagnostics;
	if (diagnostics === undefined) throw new Error("diagnostics");
	const stop = diagnostics.subscribe((event) => void codes.push(event.code));
	const html = renderToString(tree(() => `${useTheme().theme()}/${useTheme().resolvedTheme()}`));
	stop();
	expect(html).toBe("dark/dark");
	expect(codes).not.toContain("SERVER_WRITE");
});

it("outside", () => {
	expect(() => renderToString(() => useTheme().theme())).toThrow(/ThemeProvider/);
});
