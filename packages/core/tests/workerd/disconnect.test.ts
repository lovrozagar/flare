import { Agent, request } from "node:http";
import { Miniflare } from "miniflare";
import { expect, it } from "vitest";

// A worker with no Flare code: it streams a line every 100 ms, records when its request's signal aborts and when its
// body is cancelled, and answers /status with what it saw. `?wrap` rebuilds the request as Flare's adapter does.
const script = `
let seen = "none";
export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/status") return new Response(seen);
		const req = url.searchParams.has("wrap") ? new Request(url, request) : request;
		seen = "running";
		req.signal.addEventListener("abort", () => { seen = "aborted"; });
		let n = 0;
		const body = new ReadableStream({
			async pull(controller) {
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (req.signal.aborted || n > 30) return controller.close();
				controller.enqueue(new TextEncoder().encode("line " + n++ + "\\n"));
			},
			cancel() { if (seen === "running") seen = "cancelled"; },
		});
		return new Response(body, { headers: { "content-type": "text/plain" } });
	},
};`;

async function seenAfterStop(flags: string[], wrap: boolean): Promise<string> {
	const runtime = new Miniflare({ modules: true, script, compatibilityDate: "2026-07-01", compatibilityFlags: flags });
	try {
		const origin = await runtime.ready;
		const stop = new AbortController();
		const response = await fetch(new URL(wrap ? "/s?wrap" : "/s", origin), { signal: stop.signal });
		await response.body?.getReader().read();
		stop.abort();
		await new Promise((resolve) => setTimeout(resolve, 500));
		return await (await fetch(new URL("/status", origin))).text();
	} finally {
		await runtime.dispose();
	}
}

// Local Miniflare never tells the worker that the client went away, with or without `enable_request_signal`, so a
// stream's server side runs to its end there. When a Miniflare release starts reporting it, this turns red: that is
// the cue to un-skip `docs-data` `stream abort` on the workers projects (dx/adapters.md, BUGS.md B45).
it("miniflare drops disconnect", { timeout: 30_000 }, async () => {
	const seen: string[] = [];
	for (const flags of [[], ["enable_request_signal"]]) {
		for (const wrap of [false, true]) seen.push(await seenAfterStop(flags, wrap));
	}
	expect(seen).toEqual(["running", "running", "running", "running"]);
});

// A worker that answers 403 without reading the request body, as a CSRF rejection does.
const early = `export default { fetch: () => new Response("forbidden", { status: 403 }) };`;

function post(origin: URL, agent: Agent): Promise<string> {
	return new Promise((resolve) => {
		const body = JSON.stringify({ text: "hi" });
		const headers = { "content-type": "application/json", "content-length": String(body.length) };
		const sent = request(new URL("/fn", origin), { method: "POST", agent, headers }, (response) => {
			response.resume();
			response.on("end", () => resolve(String(response.statusCode)));
		});
		sent.on("error", (error: NodeJS.ErrnoException) => resolve(error.code ?? error.message));
		sent.end(body);
	});
}

// Local Miniflare's Node front resets a keep-alive connection when the worker answers without reading the request
// body, so the next request on that socket fails. Cloudflare's edge is unchecked (plan 13.11). When a Miniflare
// release keeps the connection, this turns red: that is the cue to give the rejected POSTs in `docs-resilience`
// `csrf headers` their body back (dx/adapters.md, BUGS.md B56).
it("miniflare resets unread body", { timeout: 30_000 }, async () => {
	const runtime = new Miniflare({ modules: true, script: early, compatibilityDate: "2026-07-01" });
	const agent = new Agent({ keepAlive: true, maxSockets: 1 });
	try {
		const origin = await runtime.ready;
		expect([await post(origin, agent), await post(origin, agent)]).toEqual(["403", "ECONNRESET"]);
	} finally {
		agent.destroy();
		await runtime.dispose();
	}
});
