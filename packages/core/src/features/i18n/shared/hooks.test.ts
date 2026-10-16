import { createComponent } from "solid-js"
import { renderToString } from "@solidjs/web"
import { expect, it } from "vitest"
import { withServerContext } from "../../../server/context/ctx.ts"
import { inLoaderScope } from "../../../server/loaders/scope.ts"
import { createRouter } from "../../../shared/router/create-router.ts"
import { usePreloaderT, useLoaderT } from "./hooks.ts"
import { createTranslations } from "./translate.ts"

const translations = createTranslations({ en: { hello: "Hi {name}" }, hr: { hello: "Bok {name}" } })
const locale = createRouter({
	layouts: {},
	routeTree: [],
	locale: { locales: ["en", "hr"], defaultLocale: "en" },
}).locale
const request = { request: new Request("http://localhost/"), env: {} }

// Runs `read` as the core runs a loader or a preloader: under the request, in that call's scope.
function inRequest<T>(run: () => T): Promise<T | undefined> {
	return withServerContext(
		request,
		async () => run(),
		() => undefined,
	)
}

// Inside a loader or preloader, `t` is bound to that run's locale param, else the default.
const loader = (params: Record<string, string>) =>
	inLoaderScope("loader", { params, locale }, () => useLoaderT(translations)("hello", { name: "Ana" }))
const preloader = (): unknown =>
	inLoaderScope("preloader", { params: { locale: "hr" }, locale }, () =>
		usePreloaderT(translations)("hello", { name: "B" }),
	)

it("outside", async () => {
	expect(await inRequest(() => loader({ locale: "hr" }))).toBe("Bok Ana")
	expect(await inRequest(() => loader({}))).toBe("Hi Ana")
	expect(await inRequest(() => loader({ locale: "fr" }))).toBe("Hi Ana")
	expect(await inRequest(preloader)).toBe("Bok B")
	// The hook belongs to its own function: useLoaderT in a preloader, and the other way round, throws.
	await expect(
		inRequest(() => inLoaderScope("preloader", { params: {}, locale }, () => useLoaderT(translations))),
	).rejects.toThrow("useLoaderT runs inside a .loader()")
	await expect(
		inRequest(() => inLoaderScope("loader", { params: {}, locale }, () => usePreloaderT(translations))),
	).rejects.toThrow("usePreloaderT runs inside a .preloader()")
	// Without createRouter({ locale }) there is no tag to bind.
	await expect(
		inRequest(() => inLoaderScope("loader", { params: {} }, () => useLoaderT(translations))),
	).rejects.toThrow("useLoaderT needs createRouter({ locale })")
	// A render, a request outside any loader, and no request at all throw.
	expect(() => renderToString(() => createComponent(() => useLoaderT(translations)("hello"), {}))).toThrow(
		"useLoaderT runs inside a .loader()",
	)
	await expect(inRequest(() => useLoaderT(translations))).rejects.toThrow("useLoaderT runs inside a .loader()")
	expect(() => usePreloaderT(translations)).toThrow("usePreloaderT runs inside a .preloader()")
})
