import { expect, it } from "vitest";
import { applyMethod } from "./methods.ts";

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
