import { createHmac } from "node:crypto"
import type { APIRequestContext } from "@playwright/test"
import { expect, signedIn, test } from "./dashboard.fixture.ts"
import { E2E_ENV } from "./e2e-env.ts"

// The app's `.response()` routes (bits/17): a CSV download behind the session, dx/cache.md's purge webhook, and a
// signed billing webhook a payment provider posts from its own site.

// The e2e boot's webhook secrets (apps/dashboard/src/e2e.ts): unset, the app uses these only under FLARE_E2E.
const { REVALIDATE_SECRET, BILLING_SECRET } = E2E_ENV

async function renderOf(request: APIRequestContext, origin: string): Promise<string> {
	const html = await (await request.get(`${origin}/app/status`)).text()
	return /id="render">([^<]*)</.exec(html)?.[1] ?? ""
}

// The download is the workspace's projects as CSV, named for the browser; Flare's link handling leaves a `download`
// anchor to the browser.
test("csv export", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export").click()])
	expect(download.suggestedFilename()).toBe("projects.csv")
	// The browser may be remote (the e2e browser server), so the file is read through its stream.
	const chunks: Buffer[] = []
	for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
	const lines = Buffer.concat(chunks).toString("utf8").trimEnd().split("\n")
	expect(lines[0]).toBe("id,name,status,budget,updated")
	expect(lines.slice(1).map((line) => Number(line.split(",")[0]))).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
	const response = await page.request.get(`${dashboard.origin}/app/reports/export.csv`)
	expect(response.headers()["content-type"]).toBe("text/csv; charset=utf-8")
	expect(response.headers()["cache-control"]).toBe("private, no-store")
})

// Under the app's layout the export needs the session: without one it is the layout's 401, not the file.
test("csv needs a session", async ({ browser, dashboard }) => {
	const anonymous = await browser.newContext()
	const response = await anonymous.request.get(`${dashboard.origin}/app/reports/export.csv`)
	expect(response.status()).toBe(401)
	expect(response.headers()["content-type"] ?? "").not.toContain("text/csv")
	await anonymous.close()
})

// dx/cache.md "Purge from a webhook": a missing, wrong, partial, or prefix-less secret is 401 and purges nothing;
// the right one is 204 once the `status` tag is purged, and the next request renders the page again.
test("webhook purge", async ({ page, dashboard }) => {
	const first = await renderOf(page.request, dashboard.origin)
	expect(await renderOf(page.request, dashboard.origin)).toBe(first)
	const purge = (authorization?: string) =>
		page.request.post(`${dashboard.origin}/app/api/revalidate`, {
			headers: authorization === undefined ? {} : { authorization },
			data: { tags: ["status"] },
		})
	for (const wrong of [undefined, "Bearer nope", `Bearer ${REVALIDATE_SECRET.slice(0, 6)}`, REVALIDATE_SECRET]) {
		expect((await purge(wrong)).status(), String(wrong)).toBe(401)
	}
	expect(await renderOf(page.request, dashboard.origin)).toBe(first)
	expect((await purge(`Bearer ${REVALIDATE_SECRET}`)).status()).toBe(204)
	const next = await renderOf(page.request, dashboard.origin)
	expect(next).not.toBe(first)
	expect(await renderOf(page.request, dashboard.origin)).toBe(next)
})

// The purge route does not declare `crossOrigin`, so a POST from another site is refused before it runs, the right
// secret notwithstanding.
test("purge refuses another site", async ({ page, dashboard }) => {
	const first = await renderOf(page.request, dashboard.origin)
	const response = await page.request.post(`${dashboard.origin}/app/api/revalidate`, {
		headers: { authorization: `Bearer ${REVALIDATE_SECRET}`, origin: "https://cms.example" },
		data: { tags: ["status"] },
	})
	expect(response.status()).toBe(403)
	expect(await renderOf(page.request, dashboard.origin)).toBe(first)
})

// The billing webhook declares `crossOrigin`: the provider's signed POST from its own site changes the plan the
// owner's billing page shows. A bad signature is 401, and a GET is 405 naming POST.
test("billing webhook", async ({ page, dashboard }) => {
	const email = await signedIn(page, dashboard.origin, "/app/settings/billing")
	await expect(page.locator("#plan")).toHaveText("free")
	const url = `${dashboard.origin}/app/api/webhooks/billing`
	const body = JSON.stringify({ email, plan: "pro" })
	const signature = createHmac("sha256", BILLING_SECRET).update(body).digest("hex")
	const post = (sign: string) =>
		page.request.post(url, {
			headers: { origin: "https://payments.example", "content-type": "application/json", "x-signature": sign },
			data: body,
		})
	expect((await post("0".repeat(64))).status()).toBe(401)
	const accepted = await post(signature)
	expect(accepted.status()).toBe(200)
	expect(await accepted.json()).toMatchObject({ plan: "pro" })
	const get = await page.request.get(url)
	expect(get.status()).toBe(405)
	expect(get.headers()["allow"]).toContain("POST")
	await page.reload()
	await expect(page.locator("#plan")).toHaveText("pro")
})
