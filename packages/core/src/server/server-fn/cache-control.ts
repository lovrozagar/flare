import { parseDuration } from "../../shared/duration/index.ts";
import type { ServerFnRecord } from "./builder.ts";

const PRIVATE = "private, no-store";

// A server function is private unless it is a GET with no `authenticate`, no `authorize`, and a `cache.maxAge`
// duration. Whole seconds, rounded down (B43).
export function fnCacheControl(record: ServerFnRecord): string {
	const shared = record.method === "get" && !record.authenticate && record.authorize === undefined;
	if (!shared || record.cache === undefined) return PRIVATE;
	return `public, max-age=${Math.floor(parseDuration(record.cache.maxAge) / 1000)}`;
}

// A returned Response keeps its other headers, and this one is overwritten (B43).
export function setCacheControl(headers: Headers, record: ServerFnRecord): void {
	headers.set("cache-control", fnCacheControl(record));
}
