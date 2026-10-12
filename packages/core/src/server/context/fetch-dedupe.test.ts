import { afterEach, expect, it, vi } from "vitest";
import { withServerContext } from "./ctx.ts";
import { withFetchDedupe } from "./fetch-dedupe.ts";

const url = "https://api.test/items";

type Upstream = {
	calls: number;
	fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

function upstream(reply: (call: number) => Response | Promise<Response> = () => new Response("ok")): Upstream {
	const counter: Upstream = {
		calls: 0,
		fetch: () => {
			counter.calls += 1;
			return Promise.resolve(reply(counter.calls));
		},
	};
	return counter;
}

function inRequest<T>(run: () => Promise<T>): Promise<T> {
	return withServerContext({ request: new Request("http://localhost/"), env: {} }, run, (error) => {
		throw error;
	});
}

function chunks(...parts: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const part of parts) controller.enqueue(encoder.encode(part));
			controller.close();
		},
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

it("same GET", async () => {
	const api = upstream();
	const bodies = await inRequest(async () => {
		const get = withFetchDedupe(api);
		const both = await Promise.all([get(url), get(url)]);
		const later = await get(url);
		return Promise.all([...both, later].map((response) => response.text()));
	});
	expect(api.calls).toBe(1);
	expect(bodies).toEqual(["ok", "ok", "ok"]);
});

it("POST not deduped", async () => {
	const api = upstream();
	await inRequest(async () => {
		const post = withFetchDedupe(api);
		await post(url, { method: "POST", body: "a" });
		await post(url, { method: "POST", body: "a" });
	});
	expect(api.calls).toBe(2);
});

it("next request", async () => {
	const api = upstream();
	const get = withFetchDedupe(api);
	await inRequest(() => get(url));
	await inRequest(() => get(url));
	expect(api.calls).toBe(2);
});

it("binding", async () => {
	const seen: unknown[] = [];
	const binding = {
		fetch(this: unknown): Promise<Response> {
			seen.push(this);
			return Promise.resolve(new Response("ok"));
		},
	};
	await inRequest(() => withFetchDedupe(binding)(url));
	expect(seen).toEqual([binding]);
});

it("arrow misses", async () => {
	const api = upstream();
	await inRequest(async () => {
		await withFetchDedupe((input, init) => api.fetch(input, init))(url);
		await withFetchDedupe((input, init) => api.fetch(input, init))(url);
	});
	expect(api.calls).toBe(2);
	const bound = upstream();
	await inRequest(async () => {
		await withFetchDedupe(bound)(url);
		await withFetchDedupe(bound)(url);
	});
	expect(bound.calls).toBe(1);
});

it("over cap", async () => {
	const api = upstream((call) => new Response(call === 1 ? chunks("0123", "4567", "89") : chunks("second")));
	const bodies = await inRequest(async () => {
		const get = withFetchDedupe(api, { maxBytes: 4 });
		const first = await get(url);
		const firstBody = await first.text();
		const again = await get(url);
		return [firstBody, await again.text()];
	});
	expect(api.calls).toBe(2);
	expect(bodies).toEqual(["0123456789", "second"]);
});

it("no global patch", async () => {
	const global = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response("ok")));
	await inRequest(async () => {
		withFetchDedupe(upstream());
		await globalThis.fetch(url);
		await globalThis.fetch(url);
	});
	expect(global).toHaveBeenCalledTimes(2);
});

it("key", async () => {
	const api = upstream((call) => new Response(call === 2 ? null : "ok"));
	const bodies = await inRequest(async () => {
		const get = withFetchDedupe(api);
		const a = await get(url, { headers: { traceparent: "00-a-01-01", accept: "text/plain" } });
		const b = await get(url, { headers: { accept: "text/plain", traceparent: "00-b-01-01" } });
		const heads = [await get(new Request(url, { method: "HEAD" })), await get(url, { method: "HEAD" })];
		const other = await get(url, { headers: { accept: "application/json" } });
		return { texts: [await a.text(), await b.text(), await other.text()], heads: heads.map((r) => r.body) };
	});
	expect(api.calls).toBe(3);
	expect(bodies).toEqual({ texts: ["ok", "ok", "ok"], heads: [null, null] });
});

it("event stream", async () => {
	const api = upstream(() => new Response(chunks("data: 1\n\n"), { headers: { "content-type": "text/event-stream" } }));
	const bodies = await inRequest(async () => {
		const get = withFetchDedupe(api);
		const first = await get(url);
		const second = await get(url);
		return [await first.text(), await second.text()];
	});
	expect(api.calls).toBe(2);
	expect(bodies).toEqual(["data: 1\n\n", "data: 1\n\n"]);
});

it("post clears", async () => {
	const api = upstream();
	await inRequest(async () => {
		const get = withFetchDedupe(api);
		await get(url);
		await get(url);
		await get(url, { method: "POST", body: "a" });
		await get(url);
		await get(url, { method: "post", body: "a" });
	});
	expect(api.calls).toBe(4);
});

it("rejection", async () => {
	const api = upstream((call) => (call === 1 ? Promise.reject(new Error("down")) : new Response("ok")));
	const results = await inRequest(async () => {
		const get = withFetchDedupe(api);
		const first = await Promise.allSettled([get(url), get(url)]);
		const next = await get(url);
		return [...first.map((result) => result.status), await next.text()];
	});
	expect(results).toEqual(["rejected", "fulfilled", "ok"]);
	expect(api.calls).toBe(2);
});

it("outside", async () => {
	const api = upstream();
	const get = withFetchDedupe(api);
	await expect(get(url)).resolves.toBeInstanceOf(Response);
	await get(url);
	expect(api.calls).toBe(2);
});
