import type { PolicyClass } from "../auth/identity.ts";

declare global {
	interface ImportMetaEnv {
		// The build id flare() defines in the server environments (dx/plugin.md).
		readonly FLARE_BUILD_ID?: string;
	}
}

// What a key is built from. There is no search, no identity class segment, and no author key (B32, B73).
export type KeyInput = {
	build: string;
	route: string;
	params: Readonly<Record<string, string | string[]>>;
	class: PolicyClass;
};

// `dev` until flare() defines the production id (B84).
export function buildId(): string {
	return import.meta.env.FLARE_BUILD_ID ?? "dev";
}

// `static:<build>:<routeId>:<rawParams>` (B86). Route-order values join with `/`, a catch-all joins its segments with
// `/`, and `/` and `%` inside a value are percent-encoded. Empty params omit the last segment. A required chain is
// never stored, so it has no key (B27).
export function storeKey(input: KeyInput): string {
	if (input.class === "required") throw new Error(`${input.route}: a required chain is never stored`);
	const values = Object.values(input.params).map((value) => [value].flat().map(encode).join("/"));
	const head = `static:${input.build}:${input.route}`;
	return values.length === 0 ? head : `${head}:${values.join("/")}`;
}

function encode(value: string): string {
	return value.replaceAll("%", "%25").replaceAll("/", "%2F");
}
