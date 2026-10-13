// @vitest-environment jsdom
import { createComponent } from "solid-js";
import { renderToString, type JSX } from "@solidjs/web";
import { afterEach, expect, it } from "vitest";
import { withRequest } from "../../../shared/csp/index.ts";
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

// LocaleScript on Solid's server build, with a jsdom document to run the script in. The client row is
// script.test.tsx.
const router = createRouter({ layouts: {}, routeTree: [] });
const config = { locales: ["en", "hr", "x</script>"], defaultLocale: "en" };

afterEach(() => {
	document.documentElement.removeAttribute("lang");
});

function serverHtml(initial: string, requestNonce = "n"): string {
	const tree = (): JSX.Element =>
		createComponent(RouterContext, {
			value: router,
			get children() {
				return createComponent(LocationContext, {
					value: rootLocation,
					get children() {
						return createComponent(LocaleProvider, {
							config,
							initial,
							get children() {
								return createComponent(LocaleScript, {});
							},
						});
					},
				});
			},
		});
	return withRequest({ path: "/", nonce: requestNonce }, () => renderToString(tree));
}

function runScript(html: string): void {
	const code = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
	if (code === undefined) throw new Error("no script");
	Function(code)();
}

it("lang", () => {
	document.documentElement.lang = "de";
	const html = serverHtml("hr");
	expect(html).toMatch(/^<script nonce="n">/);
	runScript(html);
	expect(document.documentElement.lang).toBe("hr");
	expect(serverHtml("hr", "")).toMatch(/^<script>/);
	// A tag holding a script close stays inside the script.
	const escaped = serverHtml("x</script>");
	expect(escaped.match(/<\/script>/gi)).toHaveLength(1);
	runScript(escaped);
	expect(document.documentElement.lang).toBe("x</script>");
});

it("script outside", () => {
	expect(() => renderToString(() => createComponent(LocaleScript, {}))).toThrow("useLocale outside LocaleProvider");
});

it("no props", () => {
	// @ts-expect-error LocaleScript takes no props; the tag is the provider's
	const props: Parameters<typeof LocaleScript>[0] = { tag: "hr" };
	expect(props).toEqual({ tag: "hr" });
});
