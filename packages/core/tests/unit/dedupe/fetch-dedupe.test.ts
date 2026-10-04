// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { disableFetchDedupe, enableFetchDedupe, isFetchDedupeEnabled } from "../../../src/dedupe/index.ts";
import { withFetchDedupe } from "../../../src/fetch-dedupe.ts";
import { runWithServerContext } from "../../../src/server-context/index.ts";

type Handler = (request: Request, signal: AbortSignal | undefined) => Response | Promise<Response>;

/* A service-binding stand-in: `fetch` throws unless it is called on the binding, like a workerd Fetcher. */
function binding(handler: Handler = () => Response.json({ ok: true })) {
	const calls: Request[] = [];
	const signals: Array<AbortSignal | undefined> = [];
	const target = {
		fetch(this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
			if (this !== target) throw new TypeError("Illegal invocation");
			const request = new Request(input, init);
			calls.push(request);
			signals.push(init?.signal ?? undefined);
			return Promise.resolve(handler(request, init?.signal ?? undefined));
		},
	};
	return { calls, signals, target };
}

function inRequest<T>(fn: () => Promise<T>): Promise<T> {
	return runWithServerContext({ nonce: "n", request: new Request("http://localhost/") }, fn);
}

function deferred<T = void>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

const URL_A = "https://internal/v1/me";

describe("withFetchDedupe — sharing", () => {
	it("concurrent identical GETs make one upstream call and keep the binding as `this`", async () => {
		const { calls, target } = binding(() => Response.json({ id: 1 }));
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const responses = await Promise.all([fetch(URL_A), fetch(URL_A), fetch(URL_A)]);
			const bodies = await Promise.all(responses.map((r) => r.json()));
			expect(bodies).toEqual([{ id: 1 }, { id: 1 }, { id: 1 }]);
		});
		expect(calls).toHaveLength(1);
	});

	it("sequential identical GETs in one request reuse the first response", async () => {
		const { calls, target } = binding();
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const first = await fetch(URL_A);
			expect(await first.json()).toEqual({ ok: true });
			const second = await fetch(URL_A);
			expect(await second.json()).toEqual({ ok: true });
		});
		expect(calls).toHaveLength(1);
	});

	it("separate requests never share", async () => {
		const { calls, target } = binding();
		const fetch = withFetchDedupe(target);
		await inRequest(async () => (await fetch(URL_A)).text());
		await inRequest(async () => (await fetch(URL_A)).text());
		expect(calls).toHaveLength(2);
	});

	it("wrappers created per call over the same binding share one cache", async () => {
		const { calls, target } = binding();
		await inRequest(async () => {
			const [a, b] = await Promise.all([withFetchDedupe(target)(URL_A), withFetchDedupe(target)(URL_A)]);
			await Promise.all([a.text(), b.text()]);
		});
		expect(calls).toHaveLength(1);
	});

	it("different bindings never share, even for the same URL", async () => {
		const one = binding();
		const two = binding();
		await inRequest(async () => {
			const [a, b] = await Promise.all([withFetchDedupe(one.target)(URL_A), withFetchDedupe(two.target)(URL_A)]);
			await Promise.all([a.text(), b.text()]);
		});
		expect(one.calls).toHaveLength(1);
		expect(two.calls).toHaveLength(1);
	});

	it("does not share with the patched global fetch", async () => {
		const { calls, target } = binding();
		const original = globalThis.fetch;
		let globalCalls = 0;
		globalThis.fetch = () => {
			globalCalls++;
			return Promise.resolve(Response.json({ global: true }));
		};
		enableFetchDedupe();
		try {
			await inRequest(async () => {
				const [a, b] = await Promise.all([withFetchDedupe(target)(URL_A), fetch(URL_A)]);
				expect(await a.json()).toEqual({ ok: true });
				expect(await b.json()).toEqual({ global: true });
			});
		} finally {
			disableFetchDedupe();
			globalThis.fetch = original;
		}
		expect(calls).toHaveLength(1);
		expect(globalCalls).toBe(1);
	});

	it("accepts a plain fetch function", async () => {
		let count = 0;
		const fn = (_input: RequestInfo | URL, _init?: RequestInit) => {
			count++;
			return Promise.resolve(new Response("fn"));
		};
		const fetch = withFetchDedupe(fn);
		await inRequest(async () => {
			const [a, b] = await Promise.all([fetch(URL_A), fetch(URL_A)]);
			expect([await a.text(), await b.text()]).toEqual(["fn", "fn"]);
		});
		expect(count).toBe(1);
	});

	it("outside a request it passes every call through", async () => {
		const { calls, target } = binding();
		const fetch = withFetchDedupe(target);
		await Promise.all([fetch(URL_A), fetch(URL_A)]);
		expect(calls).toHaveLength(2);
	});
});

describe("withFetchDedupe — cache key", () => {
	it("Request, URL, and string inputs for one resource share", async () => {
		const { calls, target } = binding();
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const responses = await Promise.all([
				fetch(URL_A),
				fetch(new URL(URL_A)),
				fetch(new Request(URL_A)),
				fetch(URL_A, { method: "get" }),
			]);
			await Promise.all(responses.map((r) => r.text()));
		});
		expect(calls).toHaveLength(1);
	});

	it("different headers split; header order, name case, and trace headers do not", async () => {
		const { calls, target } = binding();
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const responses = await Promise.all([
				fetch(URL_A, { headers: { Authorization: "Bearer a", "X-Lang": "en", traceparent: "00-1" } }),
				fetch(URL_A, { headers: { "x-lang": "en", authorization: "Bearer a", "x-request-id": "r2" } }),
				fetch(URL_A, { headers: new Headers({ authorization: "Bearer b", "x-lang": "en" }) }),
			]);
			await Promise.all(responses.map((r) => r.text()));
		});
		expect(calls).toHaveLength(2);
	});

	it("different redirect modes split", async () => {
		const { calls, target } = binding();
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const responses = await Promise.all([fetch(URL_A), fetch(URL_A, { redirect: "manual" })]);
			await Promise.all(responses.map((r) => r.text()));
		});
		expect(calls).toHaveLength(2);
	});

	it("HEAD is shared separately from GET", async () => {
		const { calls, target } = binding((req) => new Response(req.method === "HEAD" ? null : "x"));
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const responses = await Promise.all([
				fetch(URL_A, { method: "HEAD" }),
				fetch(URL_A, { method: "HEAD" }),
				fetch(URL_A),
			]);
			expect(responses[0]?.body).toBeNull();
			expect(responses[1]?.body).toBeNull();
			expect(await responses[2]?.text()).toBe("x");
		});
		expect(calls).toHaveLength(2);
	});

	it("mutations pass through and drop memoized GETs", async () => {
		let version = 0;
		const { calls, target } = binding((req) => {
			if (req.method === "PATCH") version++;
			return Response.json({ version });
		});
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			expect(await (await fetch(URL_A)).json()).toEqual({ version: 0 });
			const patches = await Promise.all([
				fetch(URL_A, { body: "{}", method: "PATCH" }),
				fetch(URL_A, { body: "{}", method: "PATCH" }),
			]);
			await Promise.all(patches.map((r) => r.text()));
			expect(await (await fetch(URL_A)).json()).toEqual({ version: 2 });
		});
		expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH", "PATCH", "GET"]);
	});
});

describe("withFetchDedupe — responses", () => {
	it("every caller gets status, statusText, headers, url, and redirected", async () => {
		const { target } = binding(() => {
			const response = new Response("gone", { headers: { "x-up": "1" }, status: 410, statusText: "Gone" });
			Object.defineProperty(response, "url", { value: "https://internal/v1/moved" });
			Object.defineProperty(response, "redirected", { value: true });
			return response;
		});
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const responses = await Promise.all([fetch(URL_A), fetch(URL_A)]);
			for (const response of responses) {
				expect(response.status).toBe(410);
				expect(response.ok).toBe(false);
				expect(response.statusText).toBe("Gone");
				expect(response.headers.get("x-up")).toBe("1");
				expect(response.url).toBe("https://internal/v1/moved");
				expect(response.redirected).toBe(true);
				expect(await response.text()).toBe("gone");
			}
		});
	});

	it("callers own their headers", async () => {
		const { target } = binding(() => new Response("x", { headers: { "x-up": "1" } }));
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const [a, b] = await Promise.all([fetch(URL_A), fetch(URL_A)]);
			a.headers.set("x-up", "changed");
			expect(b.headers.get("x-up")).toBe("1");
		});
	});

	it("null-body statuses are shared", async () => {
		const { calls, target } = binding(() => new Response(null, { status: 204 }));
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const [a, b] = await Promise.all([fetch(URL_A), fetch(URL_A)]);
			expect([a.status, b.status]).toEqual([204, 204]);
			expect(a.body).toBeNull();
			expect(b.body).toBeNull();
		});
		expect(calls).toHaveLength(1);
	});

	it("a failed fetch is evicted so a retry goes upstream", async () => {
		let attempt = 0;
		const { calls, target } = binding(() => {
			attempt++;
			if (attempt === 1) throw new TypeError("network down");
			return new Response("ok");
		});
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const results = await Promise.allSettled([fetch(URL_A), fetch(URL_A)]);
			expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
			expect(await (await fetch(URL_A)).text()).toBe("ok");
		});
		expect(calls).toHaveLength(2);
	});

	it("a body error reaches every reader and evicts the entry", async () => {
		let attempt = 0;
		const { calls, target } = binding(() => {
			attempt++;
			if (attempt > 1) return new Response("ok");
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("par"));
					controller.error(new Error("reset"));
				},
			});
			return new Response(body);
		});
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const [a, b] = await Promise.all([fetch(URL_A), fetch(URL_A)]);
			await expect(a.text()).rejects.toThrow();
			await expect(b.text()).rejects.toThrow();
			expect(await (await fetch(URL_A)).text()).toBe("ok");
		});
		expect(calls).toHaveLength(2);
	});
});

describe("withFetchDedupe — streaming and memory", () => {
	it("event streams are never shared and stream live", async () => {
		const release = deferred();
		const { calls, target } = binding(() => {
			const encoder = new TextEncoder();
			const body = new ReadableStream<Uint8Array>({
				async start(controller) {
					controller.enqueue(encoder.encode("data: 1\n\n"));
					await release.promise;
					controller.close();
				},
			});
			return new Response(body, { headers: { "content-type": "text/event-stream" } });
		});
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const [a, b] = await Promise.all([fetch(URL_A), fetch(URL_A)]);
			const first = await a.body?.getReader().read();
			expect(new TextDecoder().decode(first?.value)).toBe("data: 1\n\n");
			release.resolve();
			await b.text();
		});
		expect(calls).toHaveLength(2);
	});

	it("a declared length over maxBytes is not memoized", async () => {
		const { calls, target } = binding(() => new Response("x".repeat(64), { headers: { "content-length": "64" } }));
		const fetch = withFetchDedupe(target, { maxBytes: 32 });
		await inRequest(async () => {
			const [a, b] = await Promise.all([fetch(URL_A), fetch(URL_A)]);
			expect((await a.text()).length).toBe(64);
			expect((await b.text()).length).toBe(64);
		});
		expect(calls).toHaveLength(2);
	});

	it("an undeclared body over maxBytes streams in full with backpressure and is not memoized", async () => {
		let produced = 0;
		const chunk = new Uint8Array(1024);
		const { calls, target } = binding(() => {
			let sent = 0;
			const body = new ReadableStream<Uint8Array>(
				{
					pull(controller) {
						produced++;
						sent++;
						controller.enqueue(chunk);
						if (sent === 200) controller.close();
					},
				},
				{ highWaterMark: 0 },
			);
			return new Response(body);
		});
		const fetch = withFetchDedupe(target, { maxBytes: 4 * 1024 });
		await inRequest(async () => {
			const response = await fetch(URL_A);
			const reader = response.body!.getReader();
			await reader.read();
			await reader.read();
			await new Promise((r) => setTimeout(r, 20));
			/* A spare branch nobody reads would let the source run to the end. */
			expect(produced).toBeLessThan(16);
			let total = 2048;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				total += value.byteLength;
			}
			expect(total).toBe(200 * 1024);
			await (await fetch(URL_A)).arrayBuffer();
		});
		expect(calls).toHaveLength(2);
	});

	it("a reader joining after the body finished replays it", async () => {
		const { calls, target } = binding(() => new Response("full-body"));
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const first = await fetch(URL_A);
			expect(await first.text()).toBe("full-body");
			await new Promise((r) => setTimeout(r, 0));
			expect(await (await fetch(URL_A)).text()).toBe("full-body");
		});
		expect(calls).toHaveLength(1);
	});
});

describe("withFetchDedupe — abort", () => {
	it("an already-aborted signal rejects without going upstream", async () => {
		const { calls, target } = binding();
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			await expect(fetch(URL_A, { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
		});
		expect(calls).toHaveLength(0);
	});

	it("one caller aborting before headers leaves the shared fetch running for the others", async () => {
		const gate = deferred();
		const { calls, signals, target } = binding(async () => {
			await gate.promise;
			return new Response("shared");
		});
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const controller = new AbortController();
			const aborted = fetch(URL_A, { signal: controller.signal });
			const kept = fetch(URL_A, { signal: new AbortController().signal });
			controller.abort();
			await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
			gate.resolve();
			expect(await (await kept).text()).toBe("shared");
		});
		expect(calls).toHaveLength(1);
		expect(signals[0]?.aborted).toBe(false);
	});

	it("aborting every caller aborts upstream and evicts the entry", async () => {
		const gate = deferred();
		const { calls, signals, target } = binding(async (_req, signal) => {
			await Promise.race([
				gate.promise,
				new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason))),
			]);
			return new Response("late");
		});
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const one = new AbortController();
			const two = new AbortController();
			const a = fetch(URL_A, { signal: one.signal });
			const b = fetch(URL_A, { signal: two.signal });
			one.abort();
			two.abort();
			await expect(a).rejects.toMatchObject({ name: "AbortError" });
			await expect(b).rejects.toMatchObject({ name: "AbortError" });
			expect(signals[0]?.aborted).toBe(true);
			gate.resolve();
			expect(await (await fetch(URL_A)).text()).toBe("late");
		});
		expect(calls).toHaveLength(2);
	});

	it("a caller without a signal keeps the shared fetch alive", async () => {
		const gate = deferred();
		const { signals, target } = binding(async () => {
			await gate.promise;
			return new Response("kept");
		});
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const controller = new AbortController();
			const aborted = fetch(URL_A, { signal: controller.signal });
			const kept = fetch(URL_A);
			controller.abort();
			await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
			gate.resolve();
			expect(await (await kept).text()).toBe("kept");
		});
		expect(signals[0]?.aborted).toBe(false);
	});

	it("aborting mid-body errors only that caller's body", async () => {
		const release = deferred();
		const { target } = binding(() => {
			const encoder = new TextEncoder();
			const body = new ReadableStream<Uint8Array>({
				async start(controller) {
					controller.enqueue(encoder.encode("head-"));
					await release.promise;
					controller.enqueue(encoder.encode("tail"));
					controller.close();
				},
			});
			return new Response(body);
		});
		const fetch = withFetchDedupe(target);
		await inRequest(async () => {
			const controller = new AbortController();
			const [a, b] = await Promise.all([fetch(URL_A, { signal: controller.signal }), fetch(URL_A)]);
			const readA = a.text();
			const readB = b.text();
			controller.abort();
			release.resolve();
			await expect(readA).rejects.toMatchObject({ name: "AbortError" });
			expect(await readB).toBe("head-tail");
		});
	});
});

describe("global fetch patch uses the same engine", () => {
	afterEach(() => {
		while (isFetchDedupeEnabled()) disableFetchDedupe();
	});

	it("shares concurrent GETs without leaving a spare branch", async () => {
		const original = globalThis.fetch;
		let count = 0;
		globalThis.fetch = () => {
			count++;
			return Promise.resolve(new Response("g"));
		};
		enableFetchDedupe();
		try {
			await inRequest(async () => {
				const [a, b] = await Promise.all([fetch(URL_A), fetch(URL_A)]);
				expect([await a.text(), await b.text()]).toEqual(["g", "g"]);
			});
		} finally {
			disableFetchDedupe();
			globalThis.fetch = original;
		}
		expect(count).toBe(1);
	});
});
