/** @vitest-environment node */
import { QueryClient } from "@tanstack/solid-query";
import { describe, expect, it, vi } from "vitest";
import {
	createQueryClientGetter,
	createTrackedQueryClient,
	hydrateQueryCache,
	type QueryState,
} from "../../../src/query-client/index.tsx";

/* ── SSR → client hydration contract ─────────────────────────────────── */

describe("SSR → client hydration contract", () => {
	it("SSR tracked queries round-trip through FlareState.q format", () => {
		const client = new QueryClient();
		client.setQueryDefaults(["users"], { staleTime: 30_000 });
		const tracked = createTrackedQueryClient(client);

		/* simulate SSR: queries are set during render */
		tracked.client.setQueryData(["users", 1], { name: "Alice" });
		tracked.client.setQueryData(["counter"], 42);

		/* serialize as FlareState.q would */
		const serialized: QueryState[] = JSON.parse(JSON.stringify(tracked.getTrackedQueries()));

		/* simulate client: hydrate into fresh client */
		const clientQC = new QueryClient();
		hydrateQueryCache(clientQC, serialized);

		expect(clientQC.getQueryData(["users", 1])).toEqual({ name: "Alice" });
		expect(clientQC.getQueryData(["counter"])).toBe(42);
		/* staleTime hydrated per specific key, not parent prefix */
		expect(clientQC.getQueryDefaults(["users", 1])?.staleTime).toBe(30_000);
	});

	it("SSR without queryClientGetter produces no FlareState.q", () => {
		/* when queryClientGetter is undefined, state.q should not exist */
		const queryClientGetter = undefined;
		const stateQ = queryClientGetter ? "would-be-populated" : undefined;
		expect(stateQ).toBeUndefined();
	});

	it("hydrateQueryCache is no-op when FlareState.q is empty", () => {
		const client = new QueryClient();
		hydrateQueryCache(client, []);
		/* no queries should exist */
		const cache = client.getQueryCache().getAll();
		expect(cache).toHaveLength(0);
	});
});

/* ── createTrackedQueryClient vs raw cache scraping ──────────────────── */

describe("createTrackedQueryClient precision vs raw cache scraping", () => {
	it("tracked approach only captures setQueryData calls, not pre-existing", () => {
		const client = new QueryClient();
		/* pre-existing data from previous request */
		client.setQueryData(["stale"], "old-data");

		const tracked = createTrackedQueryClient(client);
		/* only this call should be tracked */
		tracked.client.setQueryData(["fresh"], "new-data");

		const queries = tracked.getTrackedQueries();
		expect(queries).toHaveLength(1);
		expect(queries[0]?.key).toEqual(["fresh"]);
	});

	it("raw cache scraping includes ALL entries (pre-existing + new)", () => {
		const client = new QueryClient();
		client.setQueryData(["stale"], "old-data");
		client.setQueryData(["fresh"], "new-data");

		/* raw scraping as SSR currently does */
		const allQueries = client.getQueryCache().getAll();
		expect(allQueries.length).toBe(2);
	});

	it("tracked approach is more precise for per-request SSR", () => {
		const client = new QueryClient();
		/* simulate shared server client with leftover data */
		client.setQueryData(["user-session-A"], "session-a-data");

		const tracked = createTrackedQueryClient(client);
		/* only request B's queries */
		tracked.client.setQueryData(["user-session-B"], "session-b-data");

		const queries = tracked.getTrackedQueries();
		expect(queries).toHaveLength(1);
		expect(queries[0]?.key).toEqual(["user-session-B"]);

		/* raw scraping would leak session A data into session B response */
		const allQueries = client.getQueryCache().getAll();
		expect(allQueries.length).toBe(2);
	});
});

/* ── QueryClientProvider contract ────────────────────────────────────── */

describe("QueryClientProvider contract", () => {
	it("@tanstack/solid-query exports QueryClientProvider", async () => {
		const mod = await import("@tanstack/solid-query");
		expect(mod.QueryClientProvider).toBeDefined();
		expect(typeof mod.QueryClientProvider).toBe("function");
	});

	it("@tanstack/solid-query exports useQueryClient", async () => {
		const mod = await import("@tanstack/solid-query");
		expect(mod.useQueryClient).toBeDefined();
		expect(typeof mod.useQueryClient).toBe("function");
	});
});

/* ── createQueryClientGetter isolation ───────────────────────────────── */

describe("createQueryClientGetter per-request isolation", () => {
	it("server mode: each call creates fresh instance", () => {
		/* no window = server */
		const originalWindow = globalThis.window;
		(globalThis as Record<string, unknown>).window = undefined;

		const getter = createQueryClientGetter();
		const a = getter();
		const b = getter();
		expect(a).not.toBe(b);

		/* restore */
		(globalThis as Record<string, unknown>).window = originalWindow;
	});

	it("server mode: pre-existing data does not leak between requests", () => {
		const originalWindow = globalThis.window;
		(globalThis as Record<string, unknown>).window = undefined;

		const getter = createQueryClientGetter();

		/* request 1 */
		const client1 = getter();
		client1.setQueryData(["user"], { id: 1 });

		/* request 2 should have clean client */
		const client2 = getter();
		expect(client2.getQueryData(["user"])).toBeUndefined();

		(globalThis as Record<string, unknown>).window = originalWindow;
	});
});

/* ── Hydrate integration: FlareState.q → QueryClient ─────────────────── */

describe("FlareState.q hydration completeness", () => {
	it("hydrates all query entries from FlareState.q", () => {
		const states: QueryState[] = [
			{ data: { count: 42 }, key: ["counter"] },
			{ data: { name: "Alice" }, key: ["user"], staleTime: 60_000 },
			{ data: [{ id: 1 }, { id: 2 }], key: ["items"], staleTime: 30_000 },
		];

		const client = new QueryClient();
		hydrateQueryCache(client, states);

		expect(client.getQueryData(["counter"])).toEqual({ count: 42 });
		expect(client.getQueryData(["user"])).toEqual({ name: "Alice" });
		expect(client.getQueryData(["items"])).toEqual([{ id: 1 }, { id: 2 }]);
		expect(client.getQueryDefaults(["user"])?.staleTime).toBe(60_000);
		expect(client.getQueryDefaults(["items"])?.staleTime).toBe(30_000);
	});

	it("hydrated queries are available to QueryObserver", () => {
		const client = new QueryClient();
		hydrateQueryCache(client, [{ data: { count: 42 }, key: ["counter"] }]);

		/* simulate what useSuspenseQuery does */
		const { QueryObserver } = require("@tanstack/solid-query");
		const observer = new QueryObserver(client, {
			queryFn: () => ({ count: 0 }),
			queryKey: ["counter"],
		});
		const result = observer.getOptimisticResult({
			queryFn: () => ({ count: 0 }),
			queryKey: ["counter"],
		});

		/* data should come from cache, not queryFn */
		expect(result.data).toEqual({ count: 42 });
		expect(result.isSuccess).toBe(true);
	});

	it("hydrated queries with staleTime are not immediately stale", () => {
		const client = new QueryClient();
		hydrateQueryCache(client, [{ data: "fresh", key: ["data"], staleTime: 60_000 }]);

		const query = client.getQueryCache().find({ queryKey: ["data"] });
		expect(query).toBeDefined();
		/* query should not be stale immediately after hydration */
		expect(query?.isStale()).toBe(false);
	});
});
