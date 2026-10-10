import { afterEach, describe, expect, it, vi } from "vitest";
import { setBuildId } from "../../../src/build-id.ts";
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts";

function doneResponse(): Response {
	return new Response(`${JSON.stringify({ t: "d" })}\n`, { headers: { "content-type": "application/x-ndjson" } });
}

function requestedUrl(spy: ReturnType<typeof vi.fn>): string {
	return String(spy.mock.calls[0]?.[0]);
}

afterEach(() => {
	setBuildId(undefined);
	vi.unstubAllGlobals();
});

describe("fetchNDJSON — build-scoped data URL", () => {
	it("appends _flare=<buildId> and keeps the existing query", async () => {
		const spy = vi.fn().mockResolvedValue(doneResponse());
		vi.stubGlobal("fetch", spy);
		setBuildId("abc123");

		await fetchNDJSON({ url: "/pricing?tab=a" });

		expect(requestedUrl(spy)).toBe("/pricing?tab=a&_flare=abc123");
	});

	it("keeps absolute URLs absolute", async () => {
		const spy = vi.fn().mockResolvedValue(doneResponse());
		vi.stubGlobal("fetch", spy);
		setBuildId("abc123");

		await fetchNDJSON({ url: "http://localhost:3000/pricing" });

		expect(requestedUrl(spy)).toBe("http://localhost:3000/pricing?_flare=abc123");
	});

	it("drops the hash, which never reaches the server", async () => {
		const spy = vi.fn().mockResolvedValue(doneResponse());
		vi.stubGlobal("fetch", spy);
		setBuildId("abc123");

		await fetchNDJSON({ url: "/docs#intro" });

		expect(requestedUrl(spy)).toBe("/docs?_flare=abc123");
	});

	it("leaves the URL alone when the page carried no build id", async () => {
		const spy = vi.fn().mockResolvedValue(doneResponse());
		vi.stubGlobal("fetch", spy);

		await fetchNDJSON({ url: "/pricing" });

		expect(requestedUrl(spy)).toBe("/pricing");
	});

	it("still sends the data header", async () => {
		const spy = vi.fn().mockResolvedValue(doneResponse());
		vi.stubGlobal("fetch", spy);
		setBuildId("abc123");

		await fetchNDJSON({ url: "/pricing" });

		const init = spy.mock.calls[0]?.[1] as { headers: Record<string, string> };
		expect(init.headers["flare-data"]).toBe("1");
	});
});
