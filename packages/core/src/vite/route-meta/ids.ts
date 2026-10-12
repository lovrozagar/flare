import { createHash } from "node:crypto";

// A server function's place in the build. `name` is its export name, or undefined when the call is not a direct
// export.
export type FnSite = { path: string; name: string | undefined };

// The B41 id: sha256 of the root-relative path, NUL, and the export name, as 16 hex characters. The transform
// injects it, so the runtime only looks ids up.
export function fnId(path: string, name: string): string {
	return createHash("sha256").update(`${path}\0${name}`).digest("hex").slice(0, 16);
}

// Every server function of the build by id. A call that is not a direct export, and two functions that hash the
// same, fail the build and name the files (B85). The same name in two files is two functions.
export function assignIds(
	sites: readonly FnSite[],
	hash: (path: string, name: string) => string = fnId,
): Map<string, FnSite> {
	const ids = new Map<string, FnSite>();
	for (const site of sites) {
		if (site.name === undefined) throw new Error(`${site.path}: createServerFn must be a direct export`);
		const id = hash(site.path, site.name);
		const taken = ids.get(id);
		if (taken !== undefined) {
			throw new Error(`Server function ids collide: ${taken.path} ${taken.name} and ${site.path} ${site.name}`);
		}
		ids.set(id, site);
	}
	return ids;
}
