import { expect, it } from "vitest";
import type { Deferred } from "../../shared/route-builder/register.ts";
import { createDefer, type DeferScope } from "./defer.ts";

const live: DeferScope = { stored: false, dev: false };

function wire(value: Deferred<unknown>): unknown {
	return JSON.parse(JSON.stringify(value));
}

function settledYet(promise: Promise<unknown>): Promise<boolean> {
	const pending = Symbol("pending");
	return Promise.race([promise, Promise.resolve(pending)]).then((value) => value !== pending);
}

it("placeholder", async () => {
	const loader = createDefer(live);
	const value = loader.defer(() => Promise.resolve(1));
	expect(wire(value)).toEqual({ __deferred: true, key: "d0" });
	await expect(value.promise).resolves.toBe(1);
	expect(loader.held).toEqual([]);
});

it("key default", () => {
	const { defer } = createDefer(live);
	expect(defer(() => Promise.resolve(1)).key).toBe("d0");
	expect(defer(() => Promise.resolve(2)).key).toBe("d1");
	expect(createDefer(live).defer(() => Promise.resolve(3)).key).toBe("d0");
});

it("nested", async () => {
	const { defer } = createDefer(live);
	const inner: Deferred<number>[] = [];
	let innerRan = false;
	defer(() => {
		inner.push(
			defer(() => {
				innerRan = true;
				return Promise.resolve(2);
			}),
		);
		return Promise.resolve(1);
	});
	expect(innerRan).toBe(false);
	expect(wire(inner[0])).toEqual({ __deferred: true, key: "d1" });
	expect(await settledYet(inner[0].promise)).toBe(false);
	const dev = createDefer({ stored: false, dev: true });
	expect(() =>
		dev.defer(() => {
			dev.defer(() => Promise.resolve(2));
			return Promise.resolve(1);
		}),
	).toThrow("defer");
	await expect(dev.defer(() => Promise.resolve(3)).promise).resolves.toBe(3);
});

it("dedupe", async () => {
	const { defer } = createDefer(live);
	let second = false;
	const first = defer(() => Promise.resolve(1), { key: "reviews" });
	const again = defer(
		() => {
			second = true;
			return Promise.resolve(2);
		},
		{ key: "reviews" },
	);
	expect(second).toBe(false);
	expect(again.promise).toBe(first.promise);
	await expect(again.promise).resolves.toBe(1);
});

it("call overrides route", async () => {
	const streamRoute = createDefer({ stored: true, route: "stream", dev: false });
	let streamed = false;
	const awaited = streamRoute.defer(() => Promise.resolve(1), { prerender: "resolve" });
	const hole = streamRoute.defer(() => {
		streamed = true;
		return Promise.resolve(2);
	});
	expect(streamRoute.held).toEqual([awaited.promise]);
	await expect(awaited.promise).resolves.toBe(1);
	expect(streamed).toBe(false);
	expect(await settledYet(hole.promise)).toBe(false);
	const resolveRoute = createDefer({ stored: true, dev: false });
	let ran = false;
	resolveRoute.defer(
		() => {
			ran = true;
			return Promise.resolve(3);
		},
		{ prerender: "stream" },
	);
	const plain = resolveRoute.defer(() => Promise.resolve(5));
	expect(ran).toBe(false);
	expect(resolveRoute.held).toEqual([plain.promise]);
	const notStored = createDefer(live);
	await expect(notStored.defer(() => Promise.resolve(4), { prerender: "stream" }).promise).resolves.toBe(4);
	expect(notStored.held).toEqual([]);
});

it("started", async () => {
	const loader = createDefer(live);
	const first = loader.defer(() => Promise.resolve("a"));
	loader.defer(() => Promise.reject(new Error("b")));
	loader.defer(() => Promise.resolve("again"), { key: "d0" });
	expect(loader.started.map((entry) => entry.key)).toEqual(["d0", "d1"]);
	expect(loader.started[0].promise).toBe(first.promise);
	await expect(loader.started[1].promise).rejects.toThrow("b");
	const stored = createDefer({ stored: true, route: "stream", dev: false });
	stored.defer(() => Promise.resolve(1));
	expect(stored.started).toEqual([]);
});

it("prefetch skip", async () => {
	const calls: string[] = [];
	const loader = createDefer({ stored: false, dev: false, prefetch: true });
	const value = loader.defer(() => {
		calls.push("ran");
		return Promise.resolve(1);
	});
	expect(wire(value)).toEqual({ __deferred: true, key: "d0" });
	expect(calls).toEqual([]);
	expect(loader.started).toEqual([]);
	expect(await settledYet(value.promise)).toBe(false);
});
