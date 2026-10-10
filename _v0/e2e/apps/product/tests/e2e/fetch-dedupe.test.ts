import { expect, test } from "@playwright/test";

const BIG = 2 * 1024 * 1024;

test("server fetches share GET / HEAD per request on this runtime", async ({ page, request }) => {
	const token = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
	await page.goto(`/fetch-dedupe-test?token=${token}`);
	const raw = await page.getByTestId("fetch-dedupe").textContent();
	const data = JSON.parse(raw ?? "{}") as {
		abortedName: string;
		bigAfter: number;
		bigLengths: number[];
		bindingBodies: unknown[];
		jsonUrl: string;
		kept: unknown;
		realBinding: boolean;
		sharedBodies: unknown[];
		sharedTypes: Array<string | null>;
		sharedUrls: string[];
		sseBodies: string[];
		standInCalls: number;
	};

	const hitsResponse = await request.get(`/api/dedupe-hits?token=${token}`);
	const hits = (await hitsResponse.json()) as Record<string, number>;

	/* Three concurrent and one sequential GET: one upstream hit, four full bodies with url and headers. */
	expect(hits.json).toBe(1);
	expect(data.sharedBodies).toEqual(Array.from({ length: 4 }, () => ({ kind: "json", token })));
	expect(data.sharedUrls).toEqual(Array(4).fill(data.jsonUrl));
	expect(data.sharedTypes).toEqual(Array(4).fill("application/json"));

	/* withFetchDedupe over a binding: wrappers built per call still share; `this` stays the binding. */
	expect(hits.binding).toBe(1);
	expect(data.bindingBodies).toEqual(Array.from({ length: 3 }, () => ({ kind: "binding", token })));
	if (process.env.FLARE_E2E_ENV === "workers") expect(data.realBinding).toBe(true);
	if (!data.realBinding) expect(data.standInCalls).toBe(1);

	/* Over the memoize cap: concurrent callers still share one stream, later callers refetch. */
	expect(data.bigLengths).toEqual([BIG, BIG]);
	expect(data.bigAfter).toBe(BIG);
	expect(hits.big).toBe(2);

	/* Event streams are never shared. */
	expect(data.sseBodies).toEqual(Array(2).fill("data: one\n\ndata: two\n\n"));
	expect(hits.sse).toBe(2);

	/* A mutation drops memoized GETs. */
	expect(hits.mut).toBe(2);

	/* One caller aborting does not cancel the fetch it shares. */
	expect(data.abortedName).toBe("AbortError");
	expect(data.kept).toEqual({ kind: "slow", token });
	expect(hits.slow).toBe(1);
});
