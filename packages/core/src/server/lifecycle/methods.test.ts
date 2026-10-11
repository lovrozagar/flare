import { expect, it } from "vitest";
import { applyMethod, routeMethod, type MethodMatch } from "./methods.ts";

const document = () => new Response("hello", { status: 200, headers: { "x-flare": "1" } });

function call(method: string): Promise<Response> {
	return Promise.resolve(applyMethod(new Request("http://localhost/", { method }), document()));
}

it("GET serves", async () => {
	const response = await call("GET");
	expect(response.status).toBe(200);
});

it("HEAD is empty", async () => {
	const get = await call("GET");
	const head = await call("HEAD");
	expect(head.status).toBe(200);
	expect(head.headers.get("x-flare")).toBe(get.headers.get("x-flare"));
	expect((await head.arrayBuffer()).byteLength).toBe(0);
});

it("OPTIONS", async () => {
	const response = await call("OPTIONS");
	expect(response.status).toBe(204);
	expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
});

it("POST is 405", async () => {
	const response = await call("POST");
	expect(response.status).toBe(405);
	expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
});

it("order", async () => {
	const calls: string[] = [];
	const response = await routeMethod(new Request("http://localhost/page", { method: "POST" }), {
		match() {
			calls.push("match");
			return {
				kind: "page",
				render() {
					calls.push("render");
					return new Response("page");
				},
			};
		},
	});
	expect(calls).toEqual(["match"]);
	expect(response.status).toBe(405);
	expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
	const allowed = await routeMethod(new Request("http://localhost/page", { method: "GET" }), {
		match() {
			calls.push("match");
			return {
				kind: "page",
				render() {
					calls.push("render");
					return new Response("page", { status: 200 });
				},
			};
		},
	});
	expect(calls).toEqual(["match", "match", "render"]);
	expect(allowed.status).toBe(200);
	expect(await allowed.text()).toBe("page");
});

it("response methods", async () => {
	const seen: string[] = [];
	const match = (): MethodMatch => ({
		kind: "response",
		handle(request) {
			seen.push(request.method);
			if (request.method === "POST") return request.text().then((text) => new Response(text));
			return new Response("opt");
		},
	});
	const post = await routeMethod(new Request("http://localhost/", { method: "POST", body: "payload" }), { match });
	const options = await routeMethod(new Request("http://localhost/", { method: "OPTIONS" }), { match });
	expect(seen).toEqual(["POST", "OPTIONS"]);
	expect(await post.text()).toBe("payload");
	expect(options.status).toBe(200);
	expect(post.headers.get("allow")).toBeNull();
	expect(options.headers.get("allow")).toBeNull();
});

it("unmatched post", async () => {
	let assets = 0;
	const input = {
		match: (): MethodMatch | undefined => undefined,
		assets: () => {
			assets += 1;
			return new Response("asset");
		},
	};
	const post = await routeMethod(new Request("http://localhost/missing", { method: "POST" }), input);
	expect(post.status).toBe(405);
	expect(post.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
	expect(assets).toBe(0);
	const get = await routeMethod(new Request("http://localhost/missing", { method: "GET" }), input);
	expect(get.status).toBe(404);
	const head = await routeMethod(new Request("http://localhost/missing", { method: "HEAD" }), input);
	expect(head.status).toBe(404);
	expect(assets).toBe(0);
});
