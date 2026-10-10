/* Upstream for the fetch-dedupe e2e route: counts GETs per token so the test can assert sharing. */

const hits = new Map<string, Record<string, number>>();

export const BIG_BODY_BYTES = 2 * 1024 * 1024;
const BIG_CHUNK_BYTES = 64 * 1024;

function json(body: unknown): Response {
	return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

export async function dedupeUpstream(request: Request, url: URL): Promise<Response> {
	const token = url.searchParams.get("token") ?? "";
	const kind = url.searchParams.get("kind") ?? "json";
	if (request.method !== "GET" && request.method !== "HEAD") return json({ kind, mutated: true });

	const counts = hits.get(token) ?? {};
	counts[kind] = (counts[kind] ?? 0) + 1;
	hits.set(token, counts);

	if (kind === "big") {
		/* Streamed without a length, past the 1 MiB memoize cap. */
		const chunk = new Uint8Array(BIG_CHUNK_BYTES).fill(97);
		let sent = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(chunk);
				sent += chunk.byteLength;
				if (sent >= BIG_BODY_BYTES) controller.close();
			},
		});
		return new Response(body, { headers: { "Content-Type": "application/octet-stream" } });
	}
	if (kind === "sse") {
		return new Response("data: one\n\ndata: two\n\n", { headers: { "Content-Type": "text/event-stream" } });
	}
	if (kind === "slow") {
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	return json({ kind, token });
}

export function dedupeHits(url: URL): Response {
	return json(hits.get(url.searchParams.get("token") ?? "") ?? {});
}
