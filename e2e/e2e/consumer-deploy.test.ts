import { type ChildProcess, spawn } from "node:child_process"
import { expect, test } from "@playwright/test"

const CONSUMER_DIR = "../flare-consumer"

interface AppConfig {
	cmd: string[]
	dir: string
	expected: string
	name: string
	port: number
}

const devApps: AppConfig[] = [
	{
		cmd: ["npx", "vite", "dev", "--port", "4200"],
		dir: `${CONSUMER_DIR}/flare-cf-workers`,
		expected: "Hello from Flare on CF Workers",
		name: "CF Workers",
		port: 4200,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4201"],
		dir: `${CONSUMER_DIR}/flare-node`,
		expected: "Hello from Flare on Node",
		name: "Node",
		port: 4201,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4202"],
		dir: `${CONSUMER_DIR}/flare-vercel`,
		expected: "Hello from Flare on Vercel",
		name: "Vercel",
		port: 4202,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4203"],
		dir: `${CONSUMER_DIR}/flare-netlify`,
		expected: "Hello from Flare on Netlify",
		name: "Netlify",
		port: 4203,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4204"],
		dir: `${CONSUMER_DIR}/flare-bun`,
		expected: "Hello from Flare on Bun",
		name: "Bun",
		port: 4204,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4205"],
		dir: `${CONSUMER_DIR}/flare-deno`,
		expected: "Hello from Flare on Deno",
		name: "Deno",
		port: 4205,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4206"],
		dir: `${CONSUMER_DIR}/flare-aws-lambda`,
		expected: "Hello from Flare on AWS Lambda",
		name: "AWS Lambda",
		port: 4206,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4207"],
		dir: `${CONSUMER_DIR}/flare-aws-amplify`,
		expected: "Hello from Flare on AWS Amplify",
		name: "AWS Amplify",
		port: 4207,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4208"],
		dir: `${CONSUMER_DIR}/flare-stormkit`,
		expected: "Hello from Flare on Stormkit",
		name: "Stormkit",
		port: 4208,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4209"],
		dir: `${CONSUMER_DIR}/flare-zeabur`,
		expected: "Hello from Flare on Zeabur",
		name: "Zeabur",
		port: 4209,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4230"],
		dir: `${CONSUMER_DIR}/flare-cf-pages`,
		expected: "Hello from Flare on CF Pages",
		name: "CF Pages",
		port: 4230,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4231"],
		dir: `${CONSUMER_DIR}/flare-cf-module`,
		expected: "Hello from Flare on CF Module",
		name: "CF Module",
		port: 4231,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4232"],
		dir: `${CONSUMER_DIR}/flare-deno-deploy`,
		expected: "Hello from Flare on Deno Deploy",
		name: "Deno Deploy",
		port: 4232,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4233"],
		dir: `${CONSUMER_DIR}/flare-node-cluster`,
		expected: "Hello from Flare on Node Cluster",
		name: "Node Cluster",
		port: 4233,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4234"],
		dir: `${CONSUMER_DIR}/flare-cf-durable`,
		expected: "Hello from Flare on CF Durable",
		name: "CF Durable",
		port: 4234,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4235"],
		dir: `${CONSUMER_DIR}/flare-node-middleware`,
		expected: "Hello from Flare on Node Middleware",
		name: "Node Middleware",
		port: 4235,
	},
	{
		cmd: ["npx", "vite", "dev", "--port", "4236"],
		dir: `${CONSUMER_DIR}/flare-standard`,
		expected: "Hello from Flare on Standard",
		name: "Standard",
		port: 4236,
	},
]

function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now()
		const check = () => {
			fetch(url)
				.then((r) => {
					if (r.ok) resolve()
					else if (Date.now() - start > timeoutMs) reject(new Error(`Server not ready: ${url}`))
					else setTimeout(check, 500)
				})
				.catch(() => {
					if (Date.now() - start > timeoutMs) reject(new Error(`Server timeout: ${url}`))
					else setTimeout(check, 500)
				})
		}
		check()
	})
}

test.describe.serial("consumer apps — dev SSR @dev-only", () => {
	for (const app of devApps) {
		test(`${app.name} renders h1 with SSR`, async ({ page }) => {
			let proc: ChildProcess | undefined
			try {
				proc = spawn(app.cmd[0] ?? "echo", app.cmd.slice(1), {
					cwd: app.dir,
					stdio: "pipe",
				})

				const url = `http://localhost:${String(app.port)}`
				await waitForServer(url)

				/* SSR check via raw HTTP — h1 present in initial HTML, not client-rendered */
				const response = await page.request.get(url)
				const html = await response.text()
				expect(html).toContain(app.expected)
				expect(html).toContain("data-hk=")
				expect(html).toContain("self.flare=")

				/* Loader data SSR'd — server context requestId present in HTML */
				expect(html).toContain('data-testid="request-id"')
				expect(html).toContain('data-testid="timestamp"')

				/* CSP nonce present on script tags */
				expect(html).toMatch(/nonce="[a-f0-9]+"/)

				/* Custom response headers from .headers() */
				expect(response.headers()["x-powered-by"]).toBe("flare")
				expect(response.headers()["x-deploy-target"]).toBeTruthy()

				/* Middleware headers — timing + marker */
				expect(response.headers()["server-timing"]).toMatch(/[\w.:]+;dur=\d+/)
				expect(response.headers()["x-middleware-ran"]).toBe("true")

				/* Set-Cookie from .headers() — flare-visit token */
				expect(response.headers()["set-cookie"]).toMatch(/flare-visit=visit-\d+/)

				/* Browser check — h1 visible after hydration, loader data rendered */
				await page.goto(url)
				await expect(page.locator("h1")).toHaveText(app.expected)
				const requestId = await page.locator('[data-testid="request-id"]').textContent()
				expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
				await expect(page.locator('[data-testid="timestamp"]')).not.toHaveText("")

				/* /about route — SSR check + middleware headers */
				const aboutResponse = await page.request.get(`${url}/about`)
				const aboutHtml = await aboutResponse.text()
				expect(aboutHtml).toContain(`About — ${app.name}`)
				expect(aboutHtml).toContain('data-testid="platform"')
				expect(aboutResponse.headers()["x-powered-by"]).toBe("flare")
				expect(aboutResponse.headers()["cache-control"]).toBe("no-store")
				expect(aboutResponse.headers()["server-timing"]).toMatch(/[\w.:]+;dur=\d+/)
				expect(aboutResponse.headers()["x-middleware-ran"]).toBe("true")

				/* Cookie round-trip — visit index (sets cookie), then navigate to /about */
				await page.locator('a[href="/about"]').click()
				await expect(page.locator('[data-testid="about-heading"]')).toHaveText(
					`About — ${app.name}`,
				)
				await expect(page.locator('[data-testid="platform"]')).toHaveText(app.name)
				/* /about loader reads the cookie set by index — verify round-trip */
				const visitCookie = await page.locator('[data-testid="visit-cookie"]').textContent()
				expect(visitCookie).toMatch(/^visit-\d+$/)

				/* /deferred route — shell renders immediately, streamed data arrives */
				await page.goto(`${url}/deferred`)
				await expect(page.locator('[data-testid="deferred-heading"]')).toHaveText(
					`Deferred — ${app.name}`,
				)
				await expect(page.locator('[data-testid="shell-status"]')).toHaveText("ready")
				await expect(page.locator('[data-testid="deferred-message"]')).toHaveText(
					`streamed from ${app.name}`,
					{ timeout: 10_000 },
				)
				await expect(page.locator('[data-testid="deferred-ts"]')).not.toHaveText("")

				/* /deferred SSR — shell present in initial HTML */
				const deferredResponse = await page.request.get(`${url}/deferred`)
				const deferredHtml = await deferredResponse.text()
				expect(deferredHtml).toContain(`Deferred — ${app.name}`)
				expect(deferredHtml).toContain('data-testid="shell-status"')

				/* /old-page redirect — loader throws redirect(302) to /about */
				const redirectResponse = await page.request.get(`${url}/old-page`, {
					maxRedirects: 0,
				})
				expect(redirectResponse.status()).toBe(302)
				expect(redirectResponse.headers()["location"]).toBe("/about")

				/* /error-test — happy path renders normally */
				const errorTestResponse = await page.request.get(`${url}/error-test`)
				const errorTestHtml = await errorTestResponse.text()
				expect(errorTestResponse.status()).toBe(200)
				expect(errorTestHtml).toContain(`Error Test — ${app.name}`)
				expect(errorTestHtml).toContain('data-testid="error-status"')

				/* /error-test?fail=true — loader throws, error boundary catches, 500 status */
				const errorFailResponse = await page.request.get(`${url}/error-test?fail=true`)
				expect(errorFailResponse.status()).toBe(500)
				const errorFailHtml = await errorFailResponse.text()
				expect(errorFailHtml).toContain("Error Caught")
				expect(errorFailHtml).toContain("Intentional loader error")
				expect(errorFailHtml).toContain('data-testid="error-boundary"')

				/* /error-test — browser check */
				await page.goto(`${url}/error-test`)
				await expect(page.locator('[data-testid="error-test-heading"]')).toHaveText(
					`Error Test — ${app.name}`,
				)
				await expect(page.locator('[data-testid="error-status"]')).toHaveText("ok")

				/* /search?q=hello&page=2 — URL search params parsed by loader */
				const searchResponse = await page.request.get(`${url}/search?q=hello&page=2`)
				const searchHtml = await searchResponse.text()
				expect(searchResponse.status()).toBe(200)
				expect(searchHtml).toContain(`Search — ${app.name}`)
				expect(searchHtml).toContain("hello")
				expect(searchHtml).toContain('data-testid="search-q"')

				/* /search — browser check with params */
				await page.goto(`${url}/search?q=test&page=5`)
				await expect(page.locator('[data-testid="search-heading"]')).toHaveText(
					`Search — ${app.name}`,
				)
				await expect(page.locator('[data-testid="search-q"]')).toHaveText("test")
				await expect(page.locator('[data-testid="search-page"]')).toHaveText("5")
				await expect(page.locator('[data-testid="search-count"]')).toHaveText("2")
				await expect(page.locator('[data-testid="search-hostname"]')).toHaveText("localhost")

				/* /search without params — defaults */
				const emptySearchResponse = await page.request.get(`${url}/search`)
				const emptySearchHtml = await emptySearchResponse.text()
				expect(emptySearchHtml).toContain('data-testid="search-count"')

				/* /users/:id — dynamic route param extraction */
				const userResponse = await page.request.get(`${url}/users/42`)
				const userHtml = await userResponse.text()
				expect(userResponse.status()).toBe(200)
				expect(userHtml).toContain(`User — ${app.name}`)
				expect(userHtml).toContain('data-testid="user-id"')

				/* /users/:id — browser check with numeric id */
				await page.goto(`${url}/users/42`)
				await expect(page.locator('[data-testid="user-heading"]')).toHaveText(`User — ${app.name}`)
				await expect(page.locator('[data-testid="user-id"]')).toHaveText("42")
				await expect(page.locator('[data-testid="user-path"]')).toHaveText("/users/42")
				await expect(page.locator('[data-testid="user-platform"]')).toHaveText(app.name)

				/* /users/:id — alphanumeric id with hyphens */
				const userAlphaResponse = await page.request.get(`${url}/users/abc-def-123`)
				const userAlphaHtml = await userAlphaResponse.text()
				expect(userAlphaResponse.status()).toBe(200)
				expect(userAlphaHtml).toContain("abc-def-123")

				/* 404 — non-existent route triggers notFoundRender on root layout */
				const notFoundResponse = await page.request.get(`${url}/this-does-not-exist`)
				expect(notFoundResponse.status()).toBe(404)
				const notFoundHtml = await notFoundResponse.text()
				expect(notFoundHtml).toContain("404 — Page Not Found")
				expect(notFoundHtml).toContain(app.name)
				expect(notFoundHtml).toContain('data-testid="not-found-boundary"')

				/* /dashboard — nested layout wraps child page, layout loader runs */
				await page.goto(`${url}/dashboard`)
				await expect(page.locator('[data-testid="dashboard-layout"]')).toBeVisible()
				await expect(page.locator('[data-testid="layout-platform"]')).toHaveText(app.name)
				await expect(page.locator('[data-testid="layout-ts"]')).not.toHaveText("")
				await expect(page.locator('[data-testid="dash-overview-heading"]')).toHaveText(
					"Dashboard Overview",
				)
				await expect(page.locator('[data-testid="dash-section"]')).toHaveText("overview")

				/* /dashboard SSR — both layout and page rendered in initial HTML */
				const dashResponse = await page.request.get(`${url}/dashboard`)
				const dashHtml = await dashResponse.text()
				expect(dashHtml).toContain('data-testid="dashboard-layout"')
				expect(dashHtml).toContain('data-testid="dash-overview-heading"')
				expect(dashHtml).toContain(app.name)

				/* /dashboard/settings — same layout, different child */
				const settingsResponse = await page.request.get(`${url}/dashboard/settings`)
				const settingsHtml = await settingsResponse.text()
				expect(settingsResponse.status()).toBe(200)
				expect(settingsHtml).toContain('data-testid="dashboard-layout"')
				expect(settingsHtml).toContain("Dashboard Settings")

				/* /hash — crypto.subtle.digest across runtimes */
				const hashResponse = await page.request.get(`${url}/hash?input=hello`)
				const hashHtml = await hashResponse.text()
				expect(hashResponse.status()).toBe(200)
				expect(hashHtml).toContain(
					"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
				)

				/* /hash — browser check */
				await page.goto(`${url}/hash?input=hello`)
				await expect(page.locator('[data-testid="hash-heading"]')).toHaveText(`Hash — ${app.name}`)
				await expect(page.locator('[data-testid="hash-input"]')).toHaveText("hello")
				await expect(page.locator('[data-testid="hash-value"]')).toHaveText(
					"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
				)

				/* /hash — different input produces different hash */
				const hash2Response = await page.request.get(`${url}/hash?input=world`)
				const hash2Html = await hash2Response.text()
				expect(hash2Html).not.toContain("2cf24dba5fb0a30e")
				expect(hash2Html).toContain('data-testid="hash-value"')

				/* /encoding — btoa/atob + TextEncoder/TextDecoder round-trip */
				const encResponse = await page.request.get(`${url}/encoding?text=Hello`)
				const encHtml = await encResponse.text()
				expect(encResponse.status()).toBe(200)
				expect(encHtml).toContain(`Encoding — ${app.name}`)
				expect(encHtml).toContain("SGVsbG8=")
				expect(encHtml).toContain('data-testid="encoding-match"')

				/* /encoding — browser check with default emoji text */
				await page.goto(`${url}/encoding`)
				await expect(page.locator('[data-testid="encoding-heading"]')).toHaveText(
					`Encoding — ${app.name}`,
				)
				await expect(page.locator('[data-testid="encoding-match"]')).toHaveText("true")
				await expect(page.locator('[data-testid="encoding-decoded"]')).toHaveText(
					"Hello, World! 🌍",
				)

				/* /encoding — explicit ASCII text round-trip */
				await page.goto(`${url}/encoding?text=abc123`)
				await expect(page.locator('[data-testid="encoding-base64"]')).toHaveText("YWJjMTIz")
				await expect(page.locator('[data-testid="encoding-bytes"]')).toHaveText("6")
				await expect(page.locator('[data-testid="encoding-match"]')).toHaveText("true")

				/* /dashboard — headers chain: layout + page headers merged */
				const dashHeaderResponse = await page.request.get(`${url}/dashboard`)
				expect(dashHeaderResponse.headers()["x-dashboard-layout"]).toBe("true")
				expect(dashHeaderResponse.headers()["x-platform"]).toBe(app.name)
				expect(dashHeaderResponse.headers()["x-dashboard-page"]).toBe("overview")

				/* /files/a/b/c.txt — catch-all route extracts path segments */
				await page.goto(`${url}/files/docs/readme.md`)
				await expect(page.locator('[data-testid="files-heading"]')).toHaveText(
					`Files — ${app.name}`,
				)
				await expect(page.locator('[data-testid="files-joined"]')).toHaveText("docs/readme.md")
				await expect(page.locator('[data-testid="files-count"]')).toHaveText("2")
				await expect(page.locator('[data-testid="files-is-array"]')).toHaveText("true")
				await expect(page.locator('[data-testid="files-ext"]')).toHaveText("md")

				/* /files — deeper nesting */
				const filesDeepResponse = await page.request.get(`${url}/files/a/b/c/d.json`)
				const filesDeepHtml = await filesDeepResponse.text()
				expect(filesDeepResponse.status()).toBe(200)
				expect(filesDeepHtml).toContain("a/b/c/d.json")

				/* /files — single segment */
				const filesSingleResponse = await page.request.get(`${url}/files/solo`)
				const filesSingleHtml = await filesSingleResponse.text()
				expect(filesSingleResponse.status()).toBe(200)
				expect(filesSingleHtml).toContain("solo")

				/* /json-edge — JSON serialization edge cases */
				await page.goto(`${url}/json-edge`)
				await expect(page.locator('[data-testid="json-heading"]')).toHaveText(
					`JSON Edge — ${app.name}`,
				)
				await expect(page.locator('[data-testid="json-emoji"]')).toHaveText("Hello 🌍🔥")
				await expect(page.locator('[data-testid="json-max-safe"]')).toHaveText("9007199254740991")
				await expect(page.locator('[data-testid="json-date"]')).toHaveText(
					"1970-01-01T00:00:00.000Z",
				)
				await expect(page.locator('[data-testid="json-unicode"]')).toHaveText("éèêë")
				await expect(page.locator('[data-testid="json-null"]')).toHaveText("null")
				await expect(page.locator('[data-testid="json-nested"]')).toHaveText("42")
				await expect(page.locator('[data-testid="json-match"]')).toHaveText("true")

				/* /json-edge SSR — edge cases in initial HTML */
				const jsonResponse = await page.request.get(`${url}/json-edge`)
				const jsonHtml = await jsonResponse.text()
				expect(jsonResponse.status()).toBe(200)
				expect(jsonHtml).toContain("9007199254740991")
				expect(jsonHtml).toContain("1970-01-01T00:00:00.000Z")

				/* /seo — dynamic head meta tags from loader data */
				const seoResponse = await page.request.get(`${url}/seo?title=MyPage`)
				const seoHtml = await seoResponse.text()
				expect(seoResponse.status()).toBe(200)
				expect(seoHtml).toContain("<title>MyPage</title>")
				expect(seoHtml).toContain(`SEO test on ${app.name}`)
				expect(seoHtml).toContain('name="description"')
				expect(seoHtml).toContain('property="og:title"')
				expect(seoHtml).toContain("OG: MyPage")
				expect(seoHtml).toContain('name="twitter:card"')
				expect(seoHtml).toContain('rel="canonical"')
				expect(seoHtml).toContain('name="author"')

				/* /seo — browser check */
				await page.goto(`${url}/seo?title=TestTitle`)
				await expect(page.locator('[data-testid="seo-heading"]')).toHaveText(`SEO — ${app.name}`)
				await expect(page.locator('[data-testid="seo-title"]')).toHaveText("TestTitle")
				const pageTitle = await page.title()
				expect(pageTitle).toBe("TestTitle")

				/* /preloaded — preloader runs before loader, context passed through */
				const preloadResponse = await page.request.get(`${url}/preloaded`)
				const preloadHtml = await preloadResponse.text()
				expect(preloadResponse.status()).toBe(200)
				expect(preloadHtml).toContain(`Preloaded — ${app.name}`)
				expect(preloadHtml).toContain('data-testid="preload-order"')

				/* /preloaded — browser check */
				await page.goto(`${url}/preloaded`)
				await expect(page.locator('[data-testid="preload-heading"]')).toHaveText(
					`Preloaded — ${app.name}`,
				)
				await expect(page.locator('[data-testid="preload-order"]')).toHaveText("true")
				await expect(page.locator('[data-testid="preload-ts"]')).not.toHaveText("")
				await expect(page.locator('[data-testid="preload-ua-len"]')).not.toHaveText("0")
				await expect(page.locator('[data-testid="preload-platform"]')).toHaveText(app.name)

				/* /echo — request header inspection */
				const echoResponse = await page.request.get(`${url}/echo`, {
					headers: { "x-custom-test": "hello-from-test" },
				})
				const echoHtml = await echoResponse.text()
				expect(echoResponse.status()).toBe(200)
				expect(echoHtml).toContain(`Echo — ${app.name}`)
				expect(echoHtml).toContain("hello-from-test")
				expect(echoHtml).toContain("GET")

				/* /echo — browser check (no custom header) */
				await page.goto(`${url}/echo`)
				await expect(page.locator('[data-testid="echo-heading"]')).toHaveText(`Echo — ${app.name}`)
				await expect(page.locator('[data-testid="echo-method"]')).toHaveText("GET")
				await expect(page.locator('[data-testid="echo-host"]')).toContainText("localhost")
				await expect(page.locator('[data-testid="echo-custom"]')).toHaveText("not-set")
				await expect(page.locator('[data-testid="echo-protocol"]')).toHaveText("http:")

				/* /decode/hello%20world — URL-encoded param decoded */
				const decodeResponse = await page.request.get(`${url}/decode/hello%20world`)
				const decodeHtml = await decodeResponse.text()
				expect(decodeResponse.status()).toBe(200)
				expect(decodeHtml).toContain("hello world")

				/* /decode — browser check */
				await page.goto(`${url}/decode/hello%20world`)
				await expect(page.locator('[data-testid="decode-heading"]')).toHaveText(
					`Decode — ${app.name}`,
				)
				await expect(page.locator('[data-testid="decode-slug"]')).toHaveText("hello world")
				await expect(page.locator('[data-testid="decode-length"]')).toHaveText("11")

				/* /decode — special characters: hyphens, dots, tilde */
				const decodeSpecialResponse = await page.request.get(`${url}/decode/a-b.c~d`)
				expect(decodeSpecialResponse.status()).toBe(200)
				const decodeSpecialHtml = await decodeSpecialResponse.text()
				expect(decodeSpecialHtml).toContain("a-b.c~d")

				/* Path middleware — x-matched-path and x-has-query headers */
				const pathMwResponse = await page.request.get(`${url}/search?q=test`)
				expect(pathMwResponse.headers()["x-matched-path"]).toBe("/search")
				expect(pathMwResponse.headers()["x-has-query"]).toBe("true")
				const noQueryResponse = await page.request.get(`${url}/about`)
				expect(noQueryResponse.headers()["x-matched-path"]).toBe("/about")
				expect(noQueryResponse.headers()["x-has-query"]).toBe("false")

				/* /context — deep serverContext inspection */
				await page.goto(`${url}/context`)
				await expect(page.locator('[data-testid="ctx-heading"]')).toHaveText(
					`Context — ${app.name}`,
				)
				await expect(page.locator('[data-testid="ctx-has-uuid"]')).toHaveText("true")
				await expect(page.locator('[data-testid="ctx-pathname"]')).toHaveText("/context")
				await expect(page.locator('[data-testid="ctx-origin"]')).toContainText("localhost")
				await expect(page.locator('[data-testid="ctx-ua-present"]')).toHaveText("true")
				const isoTs = await page.locator('[data-testid="ctx-iso"]').textContent()
				expect(isoTs).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

				/* /context SSR — server context data in initial HTML */
				const ctxResponse = await page.request.get(`${url}/context`)
				const ctxHtml = await ctxResponse.text()
				expect(ctxHtml).toContain('data-testid="ctx-has-uuid"')
				expect(ctxHtml).toContain("/context")

				/* /multi-cookie — sets 3 cookies, then read them back */
				const mc1Response = await page.request.get(`${url}/multi-cookie`)
				expect(mc1Response.status()).toBe(200)
				const setCookieHeader = mc1Response.headers()["set-cookie"]
				expect(setCookieHeader).toContain("session=abc123")
				expect(setCookieHeader).toContain("theme=dark")
				expect(setCookieHeader).toContain("lang=en")

				/* /multi-cookie — browser reads cookies set by prior request */
				await page.goto(`${url}/multi-cookie`)
				await expect(page.locator('[data-testid="multi-cookie-heading"]')).toHaveText(
					`Multi Cookie — ${app.name}`,
				)
				/* Browser sends all 3 cookies from the prior page.request.get() */
				await expect(page.locator('[data-testid="mc-session"]')).toHaveText("abc123")
				await expect(page.locator('[data-testid="mc-theme"]')).toHaveText("dark")
				await expect(page.locator('[data-testid="mc-lang"]')).toHaveText("en")

				/* /time — Date and Intl APIs */
				await page.goto(`${url}/time`)
				await expect(page.locator('[data-testid="time-heading"]')).toHaveText(`Time — ${app.name}`)
				await expect(page.locator('[data-testid="time-epoch-iso"]')).toHaveText(
					"1970-01-01T00:00:00.000Z",
				)
				await expect(page.locator('[data-testid="time-epoch-ms"]')).toHaveText("0")
				await expect(page.locator('[data-testid="time-parsed"]')).toHaveText("0")
				await expect(page.locator('[data-testid="time-known-ms"]')).toHaveText("1718454600000")
				await expect(page.locator('[data-testid="time-formatted"]')).toHaveText("Jun 15, 2024")
				await expect(page.locator('[data-testid="time-now-type"]')).toHaveText("number")
				await expect(page.locator('[data-testid="time-utc"]')).toHaveText(
					"Thu, 01 Jan 1970 00:00:00 GMT",
				)

				/* /streams — Web Streams + Response API */
				await page.goto(`${url}/streams`)
				await expect(page.locator('[data-testid="streams-heading"]')).toHaveText(
					`Streams — ${app.name}`,
				)
				await expect(page.locator('[data-testid="streams-result"]')).toHaveText(
					"Hello from streams",
				)
				await expect(page.locator('[data-testid="streams-match"]')).toHaveText("true")
				await expect(page.locator('[data-testid="streams-response-body"]')).toHaveText("test-body")
				await expect(page.locator('[data-testid="streams-response-header"]')).toHaveText("true")
			} finally {
				proc?.kill()
			}
		})
	}
})

interface ProdAppConfig {
	cmd: string[]
	dir: string
	expected: string
	name: string
	port: number
}

const prodApps: ProdAppConfig[] = [
	{
		cmd: ["node", ".output/server/index.mjs"],
		dir: `${CONSUMER_DIR}/flare-node`,
		expected: "Hello from Flare on Node",
		name: "Node",
		port: 4210,
	},
	{
		cmd: ["bun", ".output/server/index.mjs"],
		dir: `${CONSUMER_DIR}/flare-bun`,
		expected: "Hello from Flare on Bun",
		name: "Bun",
		port: 4211,
	},
	{
		cmd: ["npx", "srvx", ".vercel/output/functions/__server.func/index.mjs"],
		dir: `${CONSUMER_DIR}/flare-vercel`,
		expected: "Hello from Flare on Vercel",
		name: "Vercel",
		port: 4212,
	},
	{
		cmd: ["npx", "srvx", ".zeabur/output/functions/__nitro.func/index.mjs"],
		dir: `${CONSUMER_DIR}/flare-zeabur`,
		expected: "Hello from Flare on Zeabur",
		name: "Zeabur",
		port: 4213,
	},
	{
		cmd: ["node", ".amplify-hosting/compute/default/server.js"],
		dir: `${CONSUMER_DIR}/flare-aws-amplify`,
		expected: "Hello from Flare on AWS Amplify",
		name: "AWS Amplify",
		port: 3000,
	},
	{
		cmd: ["node", ".output/server/index.mjs"],
		dir: `${CONSUMER_DIR}/flare-node-cluster`,
		expected: "Hello from Flare on Node Cluster",
		name: "Node Cluster",
		port: 4214,
	},
	{
		cmd: ["npx", "srvx", "--prod", ".output/"],
		dir: `${CONSUMER_DIR}/flare-standard`,
		expected: "Hello from Flare on Standard",
		name: "Standard",
		port: 4215,
	},
]

test.describe.serial("consumer apps — production build @prod-only", () => {
	for (const app of prodApps) {
		test(`${app.name} production build renders h1 with SSR`, async ({ page }) => {
			let proc: ChildProcess | undefined
			try {
				proc = spawn(app.cmd[0] ?? "echo", app.cmd.slice(1), {
					cwd: app.dir,
					env: { ...process.env, PORT: String(app.port) },
					stdio: "pipe",
				})

				const url = `http://localhost:${String(app.port)}`
				await waitForServer(url)

				const response = await page.request.get(url)
				const html = await response.text()
				expect(html).toContain(app.expected)
				expect(html).toContain("data-hk=")
				expect(html).toContain('data-testid="request-id"')
				expect(html).toMatch(/nonce="[a-f0-9]+"/)
				expect(response.headers()["x-powered-by"]).toBe("flare")
				expect(response.headers()["server-timing"]).toMatch(/[\w.:]+;dur=\d+/)
				expect(response.headers()["x-middleware-ran"]).toBe("true")
				expect(response.headers()["set-cookie"]).toMatch(/flare-visit=visit-\d+/)

				await page.goto(url)
				await expect(page.locator("h1")).toHaveText(app.expected)
				const requestId = await page.locator('[data-testid="request-id"]').textContent()
				expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

				/* /about route + client navigation + cookie round-trip in prod */
				await page.locator('a[href="/about"]').click()
				await expect(page.locator('[data-testid="about-heading"]')).toHaveText(
					`About — ${app.name}`,
				)
				const visitCookie = await page.locator('[data-testid="visit-cookie"]').textContent()
				expect(visitCookie).toMatch(/^visit-\d+$/)

				/* /deferred route — SSR shell + streamed NDJSON chunk in HTML */
				const deferredResponse = await page.request.get(`${url}/deferred`)
				const deferredHtml = await deferredResponse.text()
				expect(deferredHtml).toContain(`Deferred — ${app.name}`)
				expect(deferredHtml).toContain('data-testid="shell-status"')
				expect(deferredHtml).toContain(`streamed from ${app.name}`)
				expect(deferredHtml).toContain("__flare_q")

				/* /old-page redirect in prod */
				const redirectResponse = await page.request.get(`${url}/old-page`, {
					maxRedirects: 0,
				})
				expect(redirectResponse.status()).toBe(302)
				expect(redirectResponse.headers()["location"]).toBe("/about")

				/* /error-test — happy path SSR */
				const errorTestResponse = await page.request.get(`${url}/error-test`)
				expect(errorTestResponse.status()).toBe(200)
				const errorTestHtml = await errorTestResponse.text()
				expect(errorTestHtml).toContain(`Error Test — ${app.name}`)

				/* /error-test?fail=true — error boundary + 500 in prod */
				const errorFailResponse = await page.request.get(`${url}/error-test?fail=true`)
				expect(errorFailResponse.status()).toBe(500)
				const errorFailHtml = await errorFailResponse.text()
				expect(errorFailHtml).toContain("Error Caught")
				expect(errorFailHtml).toContain("Intentional loader error")

				/* /search?q=hello&page=2 — search params parsed in prod */
				const searchResponse = await page.request.get(`${url}/search?q=hello&page=2`)
				expect(searchResponse.status()).toBe(200)
				const searchHtml = await searchResponse.text()
				expect(searchHtml).toContain(`Search — ${app.name}`)
				expect(searchHtml).toContain("hello")

				/* /users/:id — dynamic param in prod */
				const userResponse = await page.request.get(`${url}/users/99`)
				expect(userResponse.status()).toBe(200)
				const userHtml = await userResponse.text()
				expect(userHtml).toContain(`User — ${app.name}`)
				expect(userHtml).toContain("99")

				/* 404 — non-existent route in prod */
				const notFoundResponse = await page.request.get(`${url}/nope`)
				expect(notFoundResponse.status()).toBe(404)
				const notFoundHtml = await notFoundResponse.text()
				expect(notFoundHtml).toContain("404 — Page Not Found")
				expect(notFoundHtml).toContain(app.name)

				/* /dashboard — nested layout + child page in prod */
				const dashResponse = await page.request.get(`${url}/dashboard`)
				expect(dashResponse.status()).toBe(200)
				const dashHtml = await dashResponse.text()
				expect(dashHtml).toContain('data-testid="dashboard-layout"')
				expect(dashHtml).toContain("Dashboard Overview")
				expect(dashHtml).toContain(app.name)

				/* /dashboard/settings — same layout, different child in prod */
				const settingsResponse = await page.request.get(`${url}/dashboard/settings`)
				expect(settingsResponse.status()).toBe(200)
				const settingsHtml = await settingsResponse.text()
				expect(settingsHtml).toContain('data-testid="dashboard-layout"')
				expect(settingsHtml).toContain("Dashboard Settings")

				/* /hash — crypto.subtle in prod */
				const hashResponse = await page.request.get(`${url}/hash?input=hello`)
				expect(hashResponse.status()).toBe(200)
				const hashHtml = await hashResponse.text()
				expect(hashHtml).toContain(
					"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
				)

				/* /encoding — encoding APIs in prod */
				const encResponse = await page.request.get(`${url}/encoding?text=Hello`)
				expect(encResponse.status()).toBe(200)
				const encHtml = await encResponse.text()
				expect(encHtml).toContain("SGVsbG8=")
				expect(encHtml).toContain(`Encoding — ${app.name}`)

				/* /dashboard — headers chain in prod */
				const dashHeaderResponse = await page.request.get(`${url}/dashboard`)
				expect(dashHeaderResponse.headers()["x-dashboard-layout"]).toBe("true")
				expect(dashHeaderResponse.headers()["x-platform"]).toBe(app.name)
				expect(dashHeaderResponse.headers()["x-dashboard-page"]).toBe("overview")

				/* /files catch-all in prod */
				const filesResponse = await page.request.get(`${url}/files/a/b/c.txt`)
				expect(filesResponse.status()).toBe(200)
				const filesHtml = await filesResponse.text()
				expect(filesHtml).toContain("a/b/c.txt")
				expect(filesHtml).toContain(`Files — ${app.name}`)

				/* /json-edge in prod */
				const jsonResponse = await page.request.get(`${url}/json-edge`)
				expect(jsonResponse.status()).toBe(200)
				const jsonHtml = await jsonResponse.text()
				expect(jsonHtml).toContain("9007199254740991")
				expect(jsonHtml).toContain("1970-01-01T00:00:00.000Z")
				expect(jsonHtml).toContain(`JSON Edge — ${app.name}`)

				/* /seo — head meta tags in prod SSR */
				const seoResponse = await page.request.get(`${url}/seo?title=ProdPage`)
				expect(seoResponse.status()).toBe(200)
				const seoHtml = await seoResponse.text()
				expect(seoHtml).toContain("<title>ProdPage</title>")
				expect(seoHtml).toContain('property="og:title"')
				expect(seoHtml).toContain("OG: ProdPage")
				expect(seoHtml).toContain('rel="canonical"')

				/* /preloaded — preloader pipeline in prod */
				const preloadResponse = await page.request.get(`${url}/preloaded`)
				expect(preloadResponse.status()).toBe(200)
				const preloadHtml = await preloadResponse.text()
				expect(preloadHtml).toContain(`Preloaded — ${app.name}`)

				/* /echo — request headers + custom header in prod */
				const echoResponse = await page.request.get(`${url}/echo`, {
					headers: { "x-custom-test": "prod-value" },
				})
				expect(echoResponse.status()).toBe(200)
				const echoHtml = await echoResponse.text()
				expect(echoHtml).toContain("prod-value")
				expect(echoHtml).toContain("GET")

				/* /decode — URL-encoded param in prod */
				const decodeResponse = await page.request.get(`${url}/decode/hello%20world`)
				expect(decodeResponse.status()).toBe(200)
				const decodeHtml = await decodeResponse.text()
				expect(decodeHtml).toContain("hello world")

				/* Path middleware in prod */
				const pathMwResponse = await page.request.get(`${url}/about`)
				expect(pathMwResponse.headers()["x-matched-path"]).toBe("/about")

				/* /context — serverContext in prod */
				const ctxResponse = await page.request.get(`${url}/context`)
				expect(ctxResponse.status()).toBe(200)
				const ctxHtml = await ctxResponse.text()
				expect(ctxHtml).toContain(`Context — ${app.name}`)
				expect(ctxHtml).toContain("/context")

				/* /multi-cookie — multiple Set-Cookie in prod */
				const mcResponse = await page.request.get(`${url}/multi-cookie`)
				expect(mcResponse.status()).toBe(200)
				const mcCookie = mcResponse.headers()["set-cookie"]
				expect(mcCookie).toContain("session=abc123")
				expect(mcCookie).toContain("theme=dark")
				expect(mcCookie).toContain("lang=en")

				/* /time — Date/Intl in prod */
				const timeResponse = await page.request.get(`${url}/time`)
				expect(timeResponse.status()).toBe(200)
				const timeHtml = await timeResponse.text()
				expect(timeHtml).toContain("1970-01-01T00:00:00.000Z")
				expect(timeHtml).toContain("1718454600000")
				expect(timeHtml).toContain("Jun 15, 2024")

				/* /streams — Web Streams in prod */
				const streamsResponse = await page.request.get(`${url}/streams`)
				expect(streamsResponse.status()).toBe(200)
				const streamsHtml = await streamsResponse.text()
				expect(streamsHtml).toContain("Hello from streams")
				expect(streamsHtml).toContain("test-body")
			} finally {
				proc?.kill()
			}
		})
	}
})
