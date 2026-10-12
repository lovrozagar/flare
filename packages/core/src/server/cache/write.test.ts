import { expect, expectTypeOf, it } from "vitest";
import type { CacheConfig } from "../../shared/route-builder/chain.ts";
import { storeTiming } from "./write.ts";

const SECOND = 1000;
const HOUR = 3600 * SECOND;

// A set `revalidate` stores for twice that, and the entry turns stale at `revalidate` (B47).
it("ttl", () => {
	expect(storeTiming("r", { isr: { revalidate: "60s" } })).toEqual({ ttl: 120 * SECOND, stale: 60 * SECOND });
});

it("ttl cap", () => {
	expect(storeTiming("r", { isr: { revalidate: "30d" } })).toEqual({ ttl: 24 * HOUR, stale: 24 * HOUR });
});

it("ssr ttl", () => {
	expect(storeTiming("r", { ssr: { ttl: "60s" } })).toEqual({ ttl: 60 * SECOND, stale: 0 });
	expect(storeTiming("r", { ssr: { ttl: "60s", staleTime: "10s" } })).toEqual({ ttl: 60 * SECOND, stale: 10 * SECOND });
});

// `ttl` is required in the type. Untyped, the server's check names the route.
it("ssr ttl missing", () => {
	expectTypeOf<{ ssr: object }>().not.toExtend<CacheConfig>();
	const untyped: unknown = { ssr: {} };
	expect(() => storeTiming("_root_/p", untyped as CacheConfig)).toThrow(/_root_\/p: cache\.ssr needs a ttl/);
});

it("stale over ttl", () => {
	expect(() => storeTiming("_root_/p", { ssr: { ttl: "1m", staleTime: "2m" } })).toThrow(
		/_root_\/p: cache\.ssr\.staleTime is longer than its ttl/,
	);
});

// On demand: 24 hours, and nothing turns stale before then (B47).
it("on demand", () => {
	expect(storeTiming("r", { isr: true })).toEqual({ ttl: 24 * HOUR, stale: 24 * HOUR });
});

it("empty object", () => {
	expect(storeTiming("r", { isr: {} })).toEqual(storeTiming("r", { isr: true }));
});

it("revalidate omitted", () => {
	expect(storeTiming("r", { isr: { params: () => [{ id: "1" }] } })).toEqual({ ttl: 24 * HOUR, stale: 24 * HOUR });
});

// A page with no mode, or `ssg`, has no mutable-store timing: ssg is read from the static seeds.
it("no timing", () => {
	expect(storeTiming("r", { ssg: true })).toBeUndefined();
	expect(storeTiming("r", undefined)).toBeUndefined();
});
