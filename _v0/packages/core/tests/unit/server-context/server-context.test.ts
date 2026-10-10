import { describe, expect, it } from "vitest";
import {
	addRevalidatedTags,
	generateNonce,
	getRevalidatedTags,
	getServerNonce,
	getServerRequest,
	getServerRequestContext,
	runWithServerContext,
	setServerNonce,
} from "../../../src/server-context/index.ts";

describe("generateNonce", () => {
	it("returns 32-char hex string", () => {
		const nonce = generateNonce();
		expect(nonce).toMatch(/^[0-9a-f]{32}$/);
	});

	it("produces unique values", () => {
		const a = generateNonce();
		const b = generateNonce();
		expect(a).not.toBe(b);
	});
});

describe("runWithServerContext", () => {
	it("runs callback synchronously", () => {
		const result = runWithServerContext({ nonce: "abc", request: new Request("http://localhost/") }, () => 42);
		expect(result).toBe(42);
	});

	it("async callback preserves context through awaits", async () => {
		const result = await runWithServerContext({ nonce: "abc", request: new Request("http://localhost/") }, async () => {
			await Promise.resolve();
			return getServerNonce();
		});
		expect(result).toBe("abc");
	});

	it("concurrent requests get isolated contexts", async () => {
		const results = await Promise.all([
			runWithServerContext({ nonce: "aaa", request: new Request("http://localhost/a") }, async () => {
				await new Promise((r) => setTimeout(r, 10));
				return getServerNonce();
			}),
			runWithServerContext({ nonce: "bbb", request: new Request("http://localhost/b") }, async () => {
				await new Promise((r) => setTimeout(r, 5));
				return getServerNonce();
			}),
		]);
		expect(results).toEqual(["aaa", "bbb"]);
	});

	it("throws inside callback propagates", () => {
		expect(() =>
			runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
				throw new Error("boom");
			}),
		).toThrow("boom");
	});
});

describe("getServerNonce", () => {
	it("returns nonce from context", () => {
		runWithServerContext({ nonce: "test-nonce", request: new Request("http://localhost/") }, () => {
			expect(getServerNonce()).toBe("test-nonce");
		});
	});

	it("throws outside context", () => {
		expect(() => getServerNonce()).toThrow("called outside request context");
	});
});

describe("setServerNonce", () => {
	it("replaces nonce on current context", () => {
		runWithServerContext({ nonce: "original", request: new Request("http://localhost/") }, () => {
			setServerNonce("replaced");
			expect(getServerNonce()).toBe("replaced");
		});
	});

	it("throws outside context", () => {
		expect(() => setServerNonce("x")).toThrow("called outside request context");
	});
});

describe("getServerRequest", () => {
	it("returns request from context", () => {
		const req = new Request("http://localhost/test");
		runWithServerContext({ nonce: "x", request: req }, () => {
			expect(getServerRequest()).toBe(req);
		});
	});

	it("throws outside context", () => {
		expect(() => getServerRequest()).toThrow("called outside request context");
	});
});

describe("getServerRequestContext", () => {
	it("set and get values", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			const ctx = getServerRequestContext();
			ctx.set("key", "value");
			expect(ctx.get("key")).toBe("value");
		});
	});

	it("get missing returns undefined", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			const ctx = getServerRequestContext();
			expect(ctx.get("missing")).toBeUndefined();
		});
	});

	it("isolated between concurrent requests", async () => {
		await Promise.all([
			runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
				const ctx = getServerRequestContext();
				ctx.set("who", "request-a");
				await new Promise((r) => setTimeout(r, 10));
				expect(ctx.get("who")).toBe("request-a");
			}),
			runWithServerContext({ nonce: "y", request: new Request("http://localhost/") }, async () => {
				const ctx = getServerRequestContext();
				ctx.set("who", "request-b");
				await new Promise((r) => setTimeout(r, 5));
				expect(ctx.get("who")).toBe("request-b");
			}),
		]);
	});

	it("throws outside context", () => {
		expect(() => getServerRequestContext()).toThrow("called outside request context");
	});
});

describe("revalidated tags tracking", () => {
	it("addRevalidatedTags stores tags in ALS store", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			addRevalidatedTags(["products", "users"]);
			expect(getRevalidatedTags()).toEqual(["products", "users"]);
		});
	});

	it("getRevalidatedTags returns empty array outside request", () => {
		expect(getRevalidatedTags()).toEqual([]);
	});

	it("multiple addRevalidatedTags calls accumulate unique tags", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			addRevalidatedTags(["products"]);
			addRevalidatedTags(["users", "products"]);
			addRevalidatedTags(["orders"]);
			expect(getRevalidatedTags()).toEqual(["products", "users", "orders"]);
		});
	});

	it("tags isolated between requests", async () => {
		await Promise.all([
			runWithServerContext({ nonce: "x", request: new Request("http://localhost/a") }, async () => {
				addRevalidatedTags(["products"]);
				await new Promise((r) => setTimeout(r, 10));
				expect(getRevalidatedTags()).toEqual(["products"]);
			}),
			runWithServerContext({ nonce: "y", request: new Request("http://localhost/b") }, async () => {
				addRevalidatedTags(["users"]);
				await new Promise((r) => setTimeout(r, 5));
				expect(getRevalidatedTags()).toEqual(["users"]);
			}),
		]);
	});
});
