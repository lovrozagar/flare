import { withFetchDedupe } from "@lovrozagar/flare/fetch-dedupe";
import { createPage } from "@lovrozagar/flare/page";

interface Binding {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/* Real network fetches back into this app, so every runtime's own fetch, Response, and streams run. */
export const route = createPage("_root_/fetch-dedupe-test")
	.loader(async (ctx) => {
		const requestUrl = new URL(ctx.request.url);
		const token = requestUrl.searchParams.get("token") ?? "none";
		const upstream = (kind: string) => `${requestUrl.origin}/api/dedupe-upstream?token=${token}&kind=${kind}`;

		const jsonUrl = upstream("json");
		const concurrent = await Promise.all([fetch(jsonUrl), fetch(jsonUrl), fetch(jsonUrl)]);
		const sequential = await fetch(jsonUrl);
		const shared = [...concurrent, sequential];
		const sharedBodies = await Promise.all(shared.map((r) => r.json()));

		/* Workers: a real service binding. Elsewhere: a stand-in that, like a Fetcher, needs `this`. */
		const self = (ctx.env as { SELF?: Binding } | undefined)?.SELF;
		let standInCalls = 0;
		const standIn: Binding = {
			fetch(this: unknown, input, init) {
				if (this !== standIn) throw new TypeError("Illegal invocation");
				standInCalls++;
				return fetch(input, init);
			},
		};
		const binding = self ?? standIn;
		const bindingUrl = upstream("binding");
		const viaBinding = await Promise.all([withFetchDedupe(binding)(bindingUrl), withFetchDedupe(binding)(bindingUrl)]);
		viaBinding.push(await withFetchDedupe(binding)(bindingUrl));
		const bindingBodies = await Promise.all(viaBinding.map((r) => r.json()));

		const bigUrl = upstream("big");
		const bigPair = await Promise.all([fetch(bigUrl), fetch(bigUrl)]);
		const bigBuffers = await Promise.all(bigPair.map((r) => r.arrayBuffer()));
		const bigAfter = await (await fetch(bigUrl)).arrayBuffer();

		const sseUrl = upstream("sse");
		const ssePair = await Promise.all([fetch(sseUrl), fetch(sseUrl)]);
		const sseBodies = await Promise.all(ssePair.map((r) => r.text()));

		const mutUrl = upstream("mut");
		await (await fetch(mutUrl)).text();
		await (await fetch(mutUrl, { body: "{}", method: "POST" })).text();
		await (await fetch(mutUrl)).text();

		const slowUrl = upstream("slow");
		const controller = new AbortController();
		const aborted = fetch(slowUrl, { signal: controller.signal }).then(
			() => "resolved",
			(e: unknown) => (e instanceof Error ? e.name : String(e)),
		);
		const kept = fetch(slowUrl).then((r) => r.json());
		await new Promise((resolve) => setTimeout(resolve, 30));
		controller.abort();

		return {
			abortedName: await aborted,
			bigAfter: bigAfter.byteLength,
			bigLengths: bigBuffers.map((b) => b.byteLength),
			bindingBodies,
			kept: await kept,
			realBinding: Boolean(self),
			sharedBodies,
			sharedTypes: shared.map((r) => r.headers.get("content-type")),
			sharedUrls: shared.map((r) => r.url),
			sseBodies,
			standInCalls,
			jsonUrl,
		};
	})
	.render((props) => <pre data-testid="fetch-dedupe">{JSON.stringify(props.loaderData)}</pre>);
