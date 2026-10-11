import { expect, it } from "vitest";
import { toRequest } from "./request.ts";

it("scheme-relative", () => {
	let calls = 0;
	const result = toRequest({
		url: "//evil/",
		router: () => {
			calls += 1;
		},
	});
	expect(result.status).toBe(400);
	expect(calls).toBe(0);
});

it("backslash", () => {
	expect(toRequest({ url: "/\\evil" }).status).toBe(400);
});

it("absolute-form", () => {
	expect(toRequest({ url: "http://evil/" }).status).toBe(400);
});

it("control", () => {
	expect(toRequest({ url: "/a\u0001" }).status).toBe(400);
});

it("trustProxy default", () => {
	const result = toRequest({ url: "/", headers: { "x-forwarded-proto": "https" } });
	expect(result.secure).toBe(false);
});

it("trustProxy one", () => {
	const result = toRequest({ url: "/", headers: { "x-forwarded-proto": "https" }, trustProxy: 1 });
	expect(result.secure).toBe(true);
});

it("forwarded for", () => {
	const many = toRequest({
		url: "/",
		headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" },
		trustProxy: 2,
		socketAddress: "9.9.9.9",
	});
	expect(many.clientIp).toBe("2.2.2.2");
	const few = toRequest({
		url: "/",
		headers: { "x-forwarded-for": "1.1.1.1" },
		trustProxy: 2,
		socketAddress: "9.9.9.9",
	});
	expect(few.clientIp).toBe("9.9.9.9");
	const ignored = toRequest({
		url: "/",
		headers: { "x-forwarded-for": "1.1.1.1" },
		socketAddress: "9.9.9.9",
	});
	expect(ignored.clientIp).toBe("9.9.9.9");
});

it("no forwarded host", () => {
	const result = toRequest({
		url: "/docs",
		headers: { host: "example.com", "x-forwarded-host": "evil.com" },
	});
	expect(result.resolvedOrigin).toBe("http://example.com");
	expect(result.url).toBe("http://example.com/docs");
});
