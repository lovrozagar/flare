import { expect, it } from "vitest";
import { createBunFetch } from "./serve.ts";

it("body limit", async () => {
	let seen = "";
	const built = createBunFetch({
		bodyLimit: 1024,
		fetch(request) {
			seen = new URL(request.url).pathname;
			return new Response("ok");
		},
	});
	expect(built.maxRequestBodySize).toBe(1024);
	const response = await built.fetch(new Request("http://localhost/page"));
	expect(seen).toBe("/page");
	expect(await response.text()).toBe("ok");
});

it("default", () => {
	const built = createBunFetch({ fetch: () => new Response("ok") });
	expect(built.maxRequestBodySize).toBe(1024 * 1024);
});
