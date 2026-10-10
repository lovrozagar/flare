/**
 * Read-only store over prerendered pages shipped in the client output
 * (`<assetsBase>/_flare-static/<buildId>/`). Pass it as `cache.static` so SSG pages are served
 * from the deploy itself, with the server adding fresh nonces and headers per request.
 *
 *   Workers: createAssetsStore((path) => env.ASSETS.fetch(new URL(path, "http://assets")))
 *   Node:    createAssetsStore(fileAssets(clientDir))
 */
import { staticAssetsBase } from "virtual:flare-build";
import { artifactBase } from "../prerender/artifact-path.ts";
import type { FlareStore, FlareStoreEntry, StaticEntryData } from "./index.ts";

/** Fetch one file by its path in the client output (e.g. `/assets/_flare-static/<id>/about.json`). */
export type FetchAsset = (path: string) => Promise<Response | null | undefined>;

const STATIC_KEY = /^static:([A-Za-z0-9_-]+):(\/.*)$/;

function readOnly(): Promise<never> {
	return Promise.reject(new Error("Flare assets store is read-only: prerendered pages ship with the build"));
}

/** A request pathname is safe to map onto a file when no decoded segment can climb out. */
function isSafePathname(pathname: string): boolean {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return false;
	}
	return !decoded.includes("\\") && !decoded.includes("\0") && !decoded.split("/").includes("..");
}

async function readText(fetchAsset: FetchAsset, path: string): Promise<string | undefined> {
	const res = await fetchAsset(path);
	if (!res?.ok) {
		await res?.body?.cancel().catch(() => {});
		return undefined;
	}
	return res.text();
}

export function createAssetsStore(fetchAsset: FetchAsset, options?: { base?: string }): FlareStore {
	const base = options?.base ?? staticAssetsBase;
	return {
		delete: readOnly,
		deleteByKeys: readOnly,
		deleteByTags: readOnly,
		async get(key: string): Promise<FlareStoreEntry | null> {
			const match = STATIC_KEY.exec(key);
			if (!match) return null;
			const [, buildId, pathname] = match as unknown as [string, string, string];
			if (!isSafePathname(pathname)) return null;

			const text = await readText(fetchAsset, `${base}/${buildId}${artifactBase(pathname)}.json`);
			if (text === undefined) return null;
			let data: StaticEntryData;
			try {
				data = JSON.parse(text) as StaticEntryData;
			} catch {
				/* Not an artifact (e.g. a dev server's HTML fallback for a missing file). */
				return null;
			}
			/* storedAt 0: an ISR page served from its build artifact is stale at once, so the
			   first visit triggers a background revalidation into the ISR store. */
			return { data, storedAt: 0 };
		},
		set: readOnly,
	};
}

/** Node/Bun/Deno: read assets from the client output directory on disk. */
export function fileAssets(clientDir: string): FetchAsset {
	return async (path) => {
		const [{ readFile }, { resolve, sep }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
		const root = resolve(clientDir);
		const target = resolve(root, `.${path}`);
		if (target !== root && !target.startsWith(root + sep)) return new Response(null, { status: 403 });
		try {
			return new Response(await readFile(target));
		} catch {
			return new Response(null, { status: 404 });
		}
	};
}
