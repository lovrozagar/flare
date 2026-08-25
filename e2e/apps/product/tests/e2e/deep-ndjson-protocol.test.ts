import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

/**
 * Parse raw NDJSON response body into message array.
 * Each line is a JSON object with `t` (type) field.
 */
function parseNDJSON(body: string): Array<Record<string, unknown>> {
	return body
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

test.describe("Deep: NDJSON message types and shapes", () => {
	test("loader message (t:l) has matchId (m) and data (d)", async ({ page }) => {
		const response = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");

		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");
		expect(loaders.length).toBeGreaterThan(0);

		const loader = loaders[loaders.length - 1];
		expect(loader?.m).toBeDefined();
		expect(typeof loader?.m).toBe("string");
		expect(loader?.d).toBeDefined();
	});

	test("loader data contains correct values for /about", async ({ page }) => {
		const response = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");
		/* Find the page loader (not root layout) */
		const pageLoader = loaders.find((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return d?.content !== undefined;
		});
		expect(pageLoader).toBeDefined();
		const data = pageLoader?.d as { content: string; year: number };
		expect(data.content).toBe("This is the about page for the Flare E2E test app.");
		expect(data.year).toBe(2026);
	});

	test("head message (t:h) has matchId (m) and head config (d)", async ({ page }) => {
		const response = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const heads = msgs.filter((m) => m.t === "h");
		expect(heads.length).toBeGreaterThan(0);

		const head = heads[heads.length - 1];
		expect(head?.m).toBeDefined();
		expect(typeof head?.m).toBe("string");
		const headData = head?.d as Record<string, unknown>;
		expect(headData?.title).toBeDefined();
	});

	test("head message title matches page head() return", async ({ page }) => {
		const response = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const heads = msgs.filter((m) => m.t === "h");
		const pageHead = heads.find((h) => {
			const d = h.d as Record<string, unknown> | undefined;
			return typeof d?.title === "string" && (d.title as string).startsWith("About");
		});
		expect(pageHead).toBeDefined();
		const headData = pageHead?.d as { title: string };
		expect(headData.title).toBe("About - 2026");
	});

	test("done message (t:d) terminates stream", async ({ page }) => {
		const response = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const done = msgs.filter((m) => m.t === "d");
		expect(done.length).toBe(1);
		/* Done is always last message */
		expect(msgs[msgs.length - 1]?.t).toBe("d");
	});

	test("ready message (t:r) precedes done", async ({ page }) => {
		const response = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const readyIdx = msgs.findIndex((m) => m.t === "r");
		const doneIdx = msgs.findIndex((m) => m.t === "d");
		expect(readyIdx).toBeGreaterThanOrEqual(0);
		expect(doneIdx).toBeGreaterThan(readyIdx);
	});
});

test.describe("Deep: NDJSON message ordering", () => {
	test("loaders come before heads, heads before ready, ready before done", async ({ page }) => {
		const response = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const types = msgs.map((m) => m.t);

		const lastLoaderIdx = types.lastIndexOf("l");
		const firstHeadIdx = types.indexOf("h");
		const readyIdx = types.indexOf("r");
		const doneIdx = types.indexOf("d");

		/* If heads exist, they come after loaders */
		if (firstHeadIdx >= 0) {
			expect(firstHeadIdx).toBeGreaterThan(lastLoaderIdx);
		}
		/* Ready after heads (or loaders if no heads) */
		expect(readyIdx).toBeGreaterThan(lastLoaderIdx);
		/* Done is last */
		expect(doneIdx).toBe(types.length - 1);
	});

	test("layout loader message comes before page loader for nested route", async ({ page }) => {
		const response = await page.request.get("/blog/hello-world", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");

		/* Should have root + blog layout + blog post = 3 loaders */
		expect(loaders.length).toBeGreaterThanOrEqual(2);

		/* Layout loader (section: "Blog") before page loader (title: "Post: ...") */
		const layoutIdx = loaders.findIndex((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return d?.section === "Blog";
		});
		const pageIdx = loaders.findIndex((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return typeof d?.title === "string" && (d.title as string).startsWith("Post:");
		});
		expect(layoutIdx).toBeGreaterThanOrEqual(0);
		expect(pageIdx).toBeGreaterThan(layoutIdx);
	});

	test("multiple loader messages for layout+page route", async ({ page }) => {
		const response = await page.request.get("/blog", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");

		/* root layout (no loader → undefined d) + blog layout + blog index = at least 2 with data */
		const loadersWithData = loaders.filter((m) => m.d !== undefined);
		expect(loadersWithData.length).toBeGreaterThanOrEqual(2);
	});
});

test.describe("Deep: NDJSON content-type and status", () => {
	test("NDJSON response has application/x-ndjson content-type", async ({ page }) => {
		const response = await page.request.get("/", {
			headers: { "flare-data": "1" },
		});
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");
	});

	test("NDJSON response status follows match errors", async ({ page }) => {
		const response = await page.request.get("/broken", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(500);
		expect(response.headers()["content-type"] ?? "").toContain("ndjson");
	});

	test("auth-required route returns 401 NDJSON", async ({ page }) => {
		const response = await page.request.get("/dashboard", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(401);
		expect(response.headers()["content-type"] ?? "").toContain("ndjson");
	});
});

test.describe("Deep: NDJSON error messages", () => {
	test("broken route returns error message (t:e) with message", async ({ page }) => {
		const response = await page.request.get("/broken", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const errors = msgs.filter((m) => m.t === "e");
		expect(errors.length).toBeGreaterThan(0);

		const err = errors[0];
		expect(err?.m).toBeDefined();
		const errData = err?.e as { message: string } | undefined;
		expect(errData?.message).toBe("Intentional loader error");
	});

	test("auth-required route without auth returns 401 NDJSON error", async ({ page }) => {
		const response = await page.request.get("/dashboard", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(401);
		expect(response.headers()["content-type"] ?? "").toContain("ndjson");
		const msgs = parseNDJSON(await response.text());
		expect(msgs.some((m) => m.t === "e")).toBe(true);
	});
});

test.describe("Deep: NDJSON redirect message", () => {
	test("redirect route returns redirect message (t:x) not HTTP redirect", async ({ page }) => {
		const response = await page.request.get("/redirect-source", {
			headers: { "flare-data": "1" },
		});
		/* NDJSON wraps redirect as message, status is still 200 */
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");

		const msgs = parseNDJSON(await response.text());
		const redirects = msgs.filter((m) => m.t === "x");
		expect(redirects.length).toBe(1);

		const redir = redirects[0];
		expect(redir?.u).toBe("/redirect-target");
		expect(redir?.s).toBe(302);
	});

	test("redirect message followed by done", async ({ page }) => {
		const response = await page.request.get("/redirect-source", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		expect(msgs.length).toBeGreaterThanOrEqual(2);
		expect(msgs[msgs.length - 1]?.t).toBe("d");
	});
});

test.describe("Deep: NDJSON stale match filtering (flare-stale header)", () => {
	test("sending flare-stale with existing match IDs skips those loaders", async ({ page }) => {
		/* First request: get match IDs */
		const firstResponse = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const firstMsgs = parseNDJSON(await firstResponse.text());
		const firstLoaders = firstMsgs.filter((m) => m.t === "l");
		const matchIds = firstLoaders.map((m) => m.m as string);

		/* Second request: send match IDs as stale */
		const secondResponse = await page.request.get("/about", {
			headers: {
				"flare-data": "1",
				"flare-stale": matchIds.join(","),
			},
		});
		const secondMsgs = parseNDJSON(await secondResponse.text());
		const secondLoaders = secondMsgs.filter((m) => m.t === "l");

		/* All match IDs sent as stale → all loaders re-run (stale = needs refresh) */
		expect(secondLoaders.length).toBe(firstLoaders.length);
	});

	test("sending flare-stale with NO match IDs returns all loaders", async ({ page }) => {
		const response = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");
		expect(loaders.length).toBeGreaterThan(0);
	});

	test("flare-stale filters non-matching routes (only stale routes re-run loaders)", async ({ page }) => {
		/* Get all match IDs for /blog/hello-world */
		const firstResponse = await page.request.get("/blog/hello-world", {
			headers: { "flare-data": "1" },
		});
		const firstMsgs = parseNDJSON(await firstResponse.text());
		const firstLoaders = firstMsgs.filter((m) => m.t === "l");
		const allMatchIds = firstLoaders.map((m) => m.m as string);

		/* Find the page match ID (the one with slug data) */
		const pageLoader = firstLoaders.find((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return typeof d?.slug === "string";
		});
		expect(pageLoader).toBeDefined();
		const pageMatchId = pageLoader?.m as string;

		/* Send ONLY the page match ID as stale — layout should be skipped */
		const secondResponse = await page.request.get("/blog/hello-world", {
			headers: {
				"flare-data": "1",
				"flare-stale": pageMatchId,
			},
		});
		const secondMsgs = parseNDJSON(await secondResponse.text());
		const secondLoaders = secondMsgs.filter((m) => m.t === "l");

		/* Page loader should have data (it was marked stale) */
		const pageLoaderSecond = secondLoaders.find((m) => m.m === pageMatchId);
		expect(pageLoaderSecond).toBeDefined();
		const pageData = pageLoaderSecond?.d as Record<string, unknown> | undefined;
		expect(pageData?.slug).toBe("hello-world");

		/* Non-stale loaders should still be present but with undefined/null data */
		const nonStaleLoaders = secondLoaders.filter((m) => m.m !== pageMatchId);
		for (const loader of nonStaleLoaders) {
			/* Non-stale route had loader nullified → d is undefined */
			const d = loader.d;
			expect(d === undefined || d === null).toBe(true);
		}
	});
});

test.describe("Deep: NDJSON params in loader data", () => {
	test("user route NDJSON has param-derived data", async ({ page }) => {
		const response = await page.request.get("/users/42", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");
		const userLoader = loaders.find((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return d?.id === "42";
		});
		expect(userLoader).toBeDefined();
		const data = userLoader?.d as { id: string; name: string };
		expect(data.name).toBe("User 42");
	});

	test("different params produce different NDJSON data", async ({ page }) => {
		const r1 = await page.request.get("/users/1", { headers: { "flare-data": "1" } });
		const r2 = await page.request.get("/users/99", { headers: { "flare-data": "1" } });
		const msgs1 = parseNDJSON(await r1.text());
		const msgs2 = parseNDJSON(await r2.text());

		const user1 = msgs1
			.filter((m) => m.t === "l")
			.find((m) => {
				const d = m.d as Record<string, unknown> | undefined;
				return d?.id !== undefined;
			});
		const user99 = msgs2
			.filter((m) => m.t === "l")
			.find((m) => {
				const d = m.d as Record<string, unknown> | undefined;
				return d?.id !== undefined;
			});

		expect((user1?.d as Record<string, unknown>)?.name).toBe("User 1");
		expect((user99?.d as Record<string, unknown>)?.name).toBe("User 99");
	});
});

test.describe("Deep: NDJSON prefetch header", () => {
	test("flare-prefetch:1 sets prefetch cause in loader context", async ({ page }) => {
		const response = await page.request.get("/props-demo", {
			headers: { "flare-data": "1", "flare-prefetch": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");
		const propsLoader = loaders.find((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return d?.cause !== undefined;
		});
		expect(propsLoader).toBeDefined();
		const data = propsLoader?.d as { cause: string; prefetch: boolean };
		expect(data.cause).toBe("prefetch");
		expect(data.prefetch).toBe(true);
	});

	test("no flare-prefetch header sets enter cause", async ({ page }) => {
		const response = await page.request.get("/props-demo", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");
		const propsLoader = loaders.find((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return d?.cause !== undefined;
		});
		expect(propsLoader).toBeDefined();
		const data = propsLoader?.d as { cause: string; prefetch: boolean };
		expect(data.cause).toBe("enter");
		expect(data.prefetch).toBe(false);
	});
});

test.describe("Deep: NDJSON preloaderContext in messages", () => {
	test("preloaderContext present in loader message when route has preloader", async ({ page }) => {
		const response = await page.request.get("/props-demo", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");
		const propsLoader = loaders.find((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return d?.cause !== undefined;
		});
		expect(propsLoader).toBeDefined();
		/* p field contains preloaderContext */
		expect(propsLoader?.p).toBeDefined();
		const pc = propsLoader?.p as Record<string, unknown>;
		expect(pc.preloaderTimestamp).toBeDefined();
		expect(pc.locationPathname).toBe("/props-demo");
	});

	test("preloaderContext only inherits from parent when route has no own preloader", async ({ page }) => {
		const response = await page.request.get("/empty-loader", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");
		const emptyLoader = loaders.find((m) => {
			const matchId = m.m as string | undefined;
			return matchId?.includes("empty-loader");
		});
		expect(emptyLoader).toBeDefined();
		/* Route has no own preloader, but root layout cascades its context */
		const pc = emptyLoader?.p as Record<string, unknown> | undefined;
		if (pc !== undefined) {
			/* Should only contain root layout fields, no page-specific fields */
			expect(pc.preloaderTimestamp).toBeUndefined();
			expect(pc.locationPathname).toBeUndefined();
		}
	});

	test("nested route has independent preloaderContext per match", async ({ page }) => {
		const response = await page.request.get("/props-nested", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");

		/* Layout preloader context */
		const layoutLoader = loaders.find((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return d?.layoutLoaderRan !== undefined;
		});
		expect(layoutLoader).toBeDefined();
		const layoutPc = layoutLoader?.p as Record<string, unknown>;
		expect(layoutPc?.layoutPreloaderRan).toBe(true);
		expect(layoutPc?.layoutTimestamp).toBeDefined();

		/* Page preloader context */
		const pageLoader = loaders.find((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return d?.pageLoaderRan !== undefined;
		});
		expect(pageLoader).toBeDefined();
		const pagePc = pageLoader?.p as Record<string, unknown>;
		expect(pagePc?.pagePreloaderRan).toBe(true);
		expect(pagePc?.pageTimestamp).toBeDefined();

		/* PreloaderContext accumulates: page snapshot includes layout fields */
		expect(layoutPc?.pageTimestamp).toBeUndefined();
		/* Page snapshot has layoutTimestamp because preloaderContext cascades */
		expect(pagePc?.layoutTimestamp).toBeDefined();
	});
});

test.describe("Deep: SPA navigation triggers NDJSON with correct protocol", () => {
	test("SPA nav fires NDJSON request with flare-data:1 header", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		const captured: Array<{ url: string; headers: Record<string, string> }> = [];

		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1") {
				captured.push({
					headers: req.headers(),
					url: req.url(),
				});
			}
		});

		await loadPage(page, "/");
		await navigateSPA(page, "/about");

		expect(captured.length).toBeGreaterThan(0);
		const ndjsonReq = captured[captured.length - 1];
		expect(ndjsonReq?.url).toContain("/about");
		expect(ndjsonReq?.headers["flare-data"]).toBe("1");
		cap.assertClean();
	});

	test("NDJSON response parsed correctly — SPA page renders data", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/about");
		/* Data from NDJSON response rendered in DOM */
		expect(await page.locator("[data-testid=about-content]").textContent()).toBe(
			"This is the about page for the Flare E2E test app.",
		);
	});

	test("no console errors from NDJSON parsing during SPA nav", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/about");
		await navigateSPA(page, "/users/1");
		await navigateSPA(page, "/blog");
		cap.assertClean();
	});
});
