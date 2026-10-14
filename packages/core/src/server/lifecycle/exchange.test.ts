import { expect, it } from "vitest";
import { answer, bare, secure, typed } from "./exchange.ts";

const exchange = {
	request: new Request("http://localhost/a"),
	secured: { headers: new Headers({ "x-frame-options": "DENY" }), nonce: "", config: {}, candidate: "" },
};

it("answer", async () => {
	const response = answer(exchange, 308, "/b");
	expect(response.status).toBe(308);
	expect(response.headers.get("location")).toBe("/b");
	expect(response.headers.get("x-frame-options")).toBe("DENY");
	expect(await response.text()).toBe("");
});

it("bare", async () => {
	const run = {
		response: new Response('{"issues":[]}', { status: 400, headers: { "content-type": "application/json" } }),
	};
	const response = await bare(exchange, run);
	expect(response.status).toBe(400);
	expect(response.headers.get("content-type")).toBe("application/json");
	expect(response.headers.get("x-frame-options")).toBe("DENY");
	expect(await response.text()).toBe('{"issues":[]}');
});

it("typed", () => {
	const headers = typed(exchange, "text/html; charset=utf-8");
	expect(headers.get("content-type")).toBe("text/html; charset=utf-8");
	expect(headers.get("x-frame-options")).toBe("DENY");
	expect(exchange.secured.headers.has("content-type")).toBe(false);
});

it("secure", async () => {
	const headers = new Headers({ "x-frame-options": "SAMEORIGIN", "x-own": "1" });
	const response = secure(exchange, { status: 201, body: "made", headers });
	expect(response.status).toBe(201);
	expect(response.headers.get("x-frame-options")).toBe("DENY");
	expect(response.headers.get("x-own")).toBe("1");
	expect(await response.text()).toBe("made");
});
