import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startPrefetchAll } from "../../../src/prefetch/all.ts";

const LIST = { css: ["/assets/about.css"], js: ["/assets/about-1.js", "/assets/root-1.js"] };

function prefetchLinks() {
	return [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]')].map((l) => ({
		as: l.getAttribute("as"),
		crossorigin: l.getAttribute("crossorigin"),
		href: l.getAttribute("href"),
	}));
}

beforeEach(() => {
	for (const l of document.head.querySelectorAll('link[rel="prefetch"]')) l.remove();
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(JSON.stringify(LIST), { headers: { "content-type": "application/json" } })),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	Reflect.deleteProperty(navigator, "connection");
});

describe("startPrefetchAll", () => {
	it("after load and idle, prefetches every route chunk (scripts with crossorigin to match module fetches)", async () => {
		startPrefetchAll("/assets/_flare-prefetch.abc.json");

		await vi.waitFor(() => expect(prefetchLinks()).toHaveLength(3));
		expect(prefetchLinks()).toEqual([
			{ as: "script", crossorigin: "", href: "/assets/about-1.js" },
			{ as: "script", crossorigin: "", href: "/assets/root-1.js" },
			{ as: "style", crossorigin: null, href: "/assets/about.css" },
		]);
		expect(fetch).toHaveBeenCalledWith("/assets/_flare-prefetch.abc.json");
	});

	it("does nothing on Data Saver", async () => {
		Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });

		startPrefetchAll("/assets/_flare-prefetch.abc.json");
		await new Promise((r) => setTimeout(r, 30));

		expect(fetch).not.toHaveBeenCalled();
		expect(prefetchLinks()).toHaveLength(0);
	});

	it("does nothing on 2G", async () => {
		Object.defineProperty(navigator, "connection", { configurable: true, value: { effectiveType: "2g" } });

		startPrefetchAll("/assets/_flare-prefetch.abc.json");
		await new Promise((r) => setTimeout(r, 30));

		expect(fetch).not.toHaveBeenCalled();
	});

	it("waits for the load event when the page is still loading", async () => {
		const ready = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
		startPrefetchAll("/assets/_flare-prefetch.abc.json");
		await new Promise((r) => setTimeout(r, 30));
		expect(fetch).not.toHaveBeenCalled();

		ready.mockReturnValue("complete");
		window.dispatchEvent(new Event("load"));
		await vi.waitFor(() => expect(prefetchLinks()).toHaveLength(3));
		ready.mockRestore();
	});

	it("never adds the same file twice", async () => {
		startPrefetchAll("/assets/_flare-prefetch.abc.json");
		await vi.waitFor(() => expect(prefetchLinks()).toHaveLength(3));
		startPrefetchAll("/assets/_flare-prefetch.abc.json");
		await new Promise((r) => setTimeout(r, 30));

		expect(prefetchLinks()).toHaveLength(3);
	});

	it("a failed list fetch is silent", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 404 })),
		);

		startPrefetchAll("/assets/_flare-prefetch.missing.json");
		await new Promise((r) => setTimeout(r, 30));

		expect(prefetchLinks()).toHaveLength(0);
	});
});
