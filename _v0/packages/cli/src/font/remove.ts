import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { removeFont } from "./tracking";

/**
 * Removes a font's directory and manifest entry.
 */
export function fontRemoveBySlug(projectRoot: string, slug: string): void {
	const fontDir = join(projectRoot, "public", "fonts", slug);
	if (existsSync(fontDir)) {
		rmSync(fontDir, { force: true, recursive: true });
	}
	removeFont(projectRoot, slug);
}
