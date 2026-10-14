import type { SecurityConfig } from "../../shared/route-builder/types.ts";
import { SECURITY_KEYS } from "../security/index.ts";
import type { Lookup } from "./epoch.ts";
import { isTombstone } from "./tombstone.ts";
import type { StoredPage, StoreTiming } from "./write.ts";

// A hit, and whether it has turned stale: a stale hit is still served, and a refresh starts behind it.
export type Hit = { page: StoredPage; stale: boolean };

// A hit only when the entry is no tombstone, no tag epoch purged it, and its ttl has not passed (dx/cache.md).
// A record that is not a stored page is a miss.
export function hitOf(looked: Lookup | null, timing: StoreTiming, now: number): Hit | undefined {
	if (looked === null || looked.purged || isTombstone(looked.entry)) return undefined;
	const age = now - looked.entry.storedAt;
	if (age >= timing.ttl) return undefined;
	const page = storedPageOf(looked.entry.data);
	return page === undefined ? undefined : { page, stale: age >= timing.stale };
}

// The record's data as a stored page, or nothing. A store returns what it was given, but its type cannot say so.
export function storedPageOf(data: unknown): StoredPage | undefined {
	if (typeof data !== "object" || data === null) return undefined;
	const html: unknown = Reflect.get(data, "html");
	const ndjson: unknown = Reflect.get(data, "ndjson");
	const sentinel: unknown = Reflect.get(data, "sentinel");
	const render: unknown = Reflect.get(data, "render");
	const headers: unknown = Reflect.get(data, "headers");
	if (typeof html !== "string" || typeof ndjson !== "string" || typeof sentinel !== "string") return undefined;
	if ((render !== "isr" && render !== "ssr" && render !== "ssg") || !Array.isArray(headers)) return undefined;
	const pairs = headers.flatMap((pair: unknown) =>
		Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string"
			? [[pair[0], pair[1]] as const]
			: [],
	);
	return { html, ndjson, sentinel, render, headers: pairs, security: securityOf(Reflect.get(data, "security")) };
}

// The route's merged `.security()` as the write stored it: each known key whose value is a string, `false`, or the
// object a CSP or Permissions-Policy takes. Anything else is dropped, and the default holds.
function securityOf(raw: unknown): SecurityConfig {
	if (typeof raw !== "object" || raw === null) return {};
	const kept = SECURITY_KEYS.flatMap((name) => {
		const value: unknown = Reflect.get(raw, name);
		const objectKey = name === "Content-Security-Policy" || name === "Permissions-Policy";
		const valid =
			typeof value === "string" || value === false || (objectKey && typeof value === "object" && value !== null);
		return valid ? [[name, value]] : [];
	});
	return Object.fromEntries(kept);
}
