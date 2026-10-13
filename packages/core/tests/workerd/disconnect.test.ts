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
