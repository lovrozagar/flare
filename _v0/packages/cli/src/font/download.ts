import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface DownloadResult {
	downloaded: number;
	failed: number;
	failedPaths: string[];
	skipped: number;
}

export interface DownloadOptions {
	batchSize?: number;
	entries: Array<[localPath: string, cdnUrl: string]>;
	fetch?: typeof globalThis.fetch;
	force?: boolean;
	onProgress?: (completed: number, total: number) => void;
	outDir: string;
}

/**
 * Extracts download entries for a specific font from the URL map.
 * Optionally filters by subset names.
 */
export function getUrlsForFont(
	slug: string,
	urlMap: Record<string, string>,
	subsets?: string[],
): Array<[localPath: string, cdnUrl: string]> {
	const prefix = `/fonts/${slug}/`;
	const entries: Array<[string, string]> = [];

	for (const [localPath, cdnUrl] of Object.entries(urlMap)) {
		if (!localPath.startsWith(prefix)) continue;
		if (!cdnUrl) continue;

		if (subsets) {
			const fileName = localPath.slice(prefix.length);
			const matchesSubset = subsets.some((s) => {
				/* subset can be followed by .woff2, -i.woff2, -400.woff2, -i-400.woff2
				   but NOT -ext (that's a different subset like latin-ext) */
				if (fileName === `${s}.woff2`) return true;
				if (!fileName.startsWith(`${s}-`)) return false;
				const afterSubset = fileName[s.length + 1];
				return afterSubset === "i" || (afterSubset !== undefined && afterSubset >= "0" && afterSubset <= "9");
			});
			if (!matchesSubset) continue;
		}

		entries.push([localPath, cdnUrl]);
	}

	entries.sort((a, b) => a[0].localeCompare(b[0]));
	return entries;
}

/**
 * Extracts unique subset names for a font from the URL map.
 */
export function getSubsetsForFont(slug: string, urlMap: Record<string, string>): string[] {
	const prefix = `/fonts/${slug}/`;
	const subsets = new Set<string>();

	for (const localPath of Object.keys(urlMap)) {
		if (!localPath.startsWith(prefix)) continue;
		const fileName = localPath.slice(prefix.length).replace(".woff2", "");
		/* strip weight suffix (-400, -700) and italic suffix (-i) */
		const subset = fileName.replace(/(-i)?(-\d+)?$/, "");
		if (subset) subsets.add(subset);
	}

	return [...subsets].sort();
}

/**
 * Downloads font files in batches with progress reporting.
 * Uses injectable fetch for testability.
 */
export async function downloadFonts(options: DownloadOptions): Promise<DownloadResult> {
	const { batchSize = 10, entries, fetch: fetchFn = globalThis.fetch, force = false, onProgress, outDir } = options;

	const result: DownloadResult = {
		downloaded: 0,
		failed: 0,
		failedPaths: [],
		skipped: 0,
	};

	if (entries.length === 0) return result;

	let completed = 0;

	for (let i = 0; i < entries.length; i += batchSize) {
		const batch = entries.slice(i, i + batchSize);

		const settled = await Promise.allSettled(
			batch.map(async ([localPath, cdnUrl]) => {
				const dest = join(outDir, localPath);

				if (!force && existsSync(dest)) {
					result.skipped++;
					return;
				}

				const dir = dirname(dest);
				if (!existsSync(dir)) {
					mkdirSync(dir, { recursive: true });
				}

				const res = await fetchFn(cdnUrl);
				if (!res.ok) {
					result.failed++;
					result.failedPaths.push(localPath);
					return;
				}

				const buffer = await res.arrayBuffer();
				writeFileSync(dest, Buffer.from(buffer));
				result.downloaded++;
			}),
		);

		for (const s of settled) {
			if (s.status === "rejected") {
				result.failed++;
				/* find which entry failed — batch index maps to settled index */
				const failedIdx = settled.indexOf(s);
				const entry = batch[failedIdx];
				if (entry) result.failedPaths.push(entry[0]);
			}
		}

		completed += batch.length;
		onProgress?.(completed, entries.length);
	}

	return result;
}
