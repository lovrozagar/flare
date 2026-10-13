import { createComponent, flush } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { afterEach, expect, it } from "vitest";
import { LocationContext, RouterContext } from "../../../shared/router/context.ts";
import { createRouter } from "../../../shared/router/create-router.ts";
import { LocaleProvider } from "./provider.tsx";
import { LocaleScript } from "./script.tsx";

// The root location, as LocationContext gives it.
const rootLocation = (): { pathname: string; search: string; hash: string } => ({
	pathname: "/",
	search: "",
	hash: "",
});

// LocaleScript on Solid's client build. The server rows are script.ssr.test.ts.
afterEach(() => {
	document.head.innerHTML = "";
	document.documentElement.removeAttribute("lang");
});

// The server's script is in the document. A client render, here two of them, inserts no second one.
it("once", () => {
	document.head.innerHTML = '<script id="server-locale"></script>';
	const host = document.createElement("div");
	const router = createRouter({ layouts: {}, routeTree: [] });
	const tree = (): JSX.Element =>
		createComponent(RouterContext, {
			value: router,
			get children() {
				return createComponent(LocationContext, {
					value: rootLocation,
					get children() {
						return createComponent(LocaleProvider, {
							config: { locales: ["en"], defaultLocale: "en" },
							get children() {
								return [createComponent(LocaleScript, {}), createComponent(LocaleScript, {})];
							},
						});
					},
				});
			},
		});
	const dispose = render(tree, host);
	flush();
	expect(document.querySelectorAll("script")).toHaveLength(1);
	expect(host.innerHTML).toBe("");
	dispose();
});
