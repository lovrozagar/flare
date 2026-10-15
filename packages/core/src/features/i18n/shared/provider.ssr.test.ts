import { createComponent, OBSERVE } from "solid-js"
import { renderToString, type JSX } from "@solidjs/web"
import { expect, it } from "vitest"
import { LocationContext, RouterContext } from "../../../shared/router/context.ts"
import { createRouter } from "../../../shared/router/create-router.ts"
import { useLocale } from "./hooks.ts"
import { LocaleProvider } from "./provider.tsx"

// The root location, as LocationContext gives it.
const rootLocation = (): { pathname: string; search: string; hash: string } => ({
	pathname: "/",
	search: "",
	hash: "",
})

// LocaleProvider on Solid's server build. The client rows are provider.test.tsx.
const router = createRouter({ layouts: {}, routeTree: [] })
const config = { locales: ["en", "hr"], defaultLocale: "en" }

function tree(initial: string | undefined, child: () => JSX.Element): () => JSX.Element {
	return () =>
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
								return child()
							},
						})
					},
				})
			},
		})
}

// The locale is a memo of `initial`. The render calls no setter (B90), and setLocale has no navigator here.
it("server pure", async () => {
	const codes: string[] = []
	const diagnostics = OBSERVE?.diagnostics
	if (diagnostics === undefined) throw new Error("diagnostics")
	const stop = diagnostics.subscribe((event) => void codes.push(event.code))
	const seen: { setLocale?: (tag: string) => Promise<void> } = {}
	const html = renderToString(
		tree("hr", () => {
			seen.setLocale = useLocale().setLocale
			return useLocale().locale()
		}),
	)
	stop()
	expect(html).toBe("hr")
	expect(codes).not.toContain("SERVER_WRITE")
	await expect(seen.setLocale?.("en")).rejects.toThrow("setLocale runs in the browser")
})
