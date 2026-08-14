import { test } from "@playwright/test"
import { loadPage } from "./helpers"

/**
 * Living smoke over routes that exist in this app. Hard-nav + hydrate only.
 * Skip loaders that throw, auth gates, redirects, and response routes.
 */
const ROUTES: Array<{ label: string; path: string }> = [
	{ label: "home", path: "/" },
	{ label: "about", path: "/about" },
	{ label: "blog", path: "/blog" },
	{ label: "blog post", path: "/blog/hello-world" },
	{ label: "user", path: "/users/42" },
	{ label: "dashboard", path: "/dashboard" },
	{ label: "dashboard settings", path: "/dashboard/settings" },
	{ label: "products", path: "/products" },
	{ label: "product", path: "/products/1" },
	{ label: "search", path: "/search?q=test" },
	{ label: "empty loader", path: "/empty-loader" },
	{ label: "null loader", path: "/null-loader" },
	{ label: "head full", path: "/head-full" },
	{ label: "static image", path: "/static-image-test" },
	{ label: "styles", path: "/styles" },
	{ label: "custom headers", path: "/custom-headers" },
	{ label: "link features", path: "/link-features" },
	{ label: "shallow", path: "/shallow-test" },
	{ label: "blocker", path: "/blocker-test" },
	{ label: "navigate demo", path: "/navigate-demo" },
	{ label: "disabled toggle", path: "/disabled-toggle" },
	{ label: "prefetch target", path: "/prefetch-target" },
	{ label: "deferred", path: "/deferred" },
	{ label: "scroll tall", path: "/scroll-tall" },
	{ label: "cache", path: "/cache-test" },
	{ label: "isr", path: "/isr-test" },
	{ label: "kv cache", path: "/kv-cache-test" },
	{ label: "deep cache", path: "/deep-cache" },
	{ label: "deep cache uncached", path: "/deep-cache/uncached" },
	{ label: "lazy", path: "/lazy-test" },
	{ label: "optional locale", path: "/optional-locale" },
	{ label: "locale home", path: "/hr" },
	{ label: "locale about", path: "/hr/about" },
	{ label: "i18n demo", path: "/i18n-demo" },
	{ label: "theme", path: "/theme-dir" },
	{ label: "context", path: "/context" },
	{ label: "echo", path: "/echo" },
	{ label: "seo", path: "/seo" },
	{ label: "preloaded", path: "/preloaded" },
	{ label: "fonts", path: "/fonts-test" },
	{ label: "hooks", path: "/hooks-test" },
	{ label: "a11y", path: "/a11y-test" },
	{ label: "ssg static", path: "/ssg-static" },
	{ label: "ssg listed slug", path: "/ssg-dynamic/hello" },
	{ label: "env-fn", path: "/env-fn-test" },
	{ label: "contact form", path: "/forms/contact" },
	{ label: "offline", path: "/offline" },
	{ label: "xss", path: "/xss" },
	{ label: "props demo", path: "/props-demo" },
	{ label: "files catch-all", path: "/files/a/b" },
	{ label: "decode slug", path: "/decode/hello%20world" },
	{ label: "head nest", path: "/head-nest/page" },
	{ label: "query basic", path: "/query-basic" },
	{ label: "time", path: "/time" },
	{ label: "streams", path: "/streams" },
	{ label: "encoding", path: "/encoding" },
	{ label: "hash", path: "/hash" },
	{ label: "json edge", path: "/json-edge" },
	{ label: "multi cookie", path: "/multi-cookie" },
	{ label: "path segment", path: "/path-segment-test/books/detail" },
]

test.describe("route smoke — current app", () => {
	for (const route of ROUTES) {
		test(`SSR hydrate: ${route.label} (${route.path})`, async ({ page }) => {
			if (route.path.startsWith("/dashboard")) {
				await page.setExtraHTTPHeaders({ "x-test-auth": "admin" })
			}
			await loadPage(page, route.path)
		})
	}
})
