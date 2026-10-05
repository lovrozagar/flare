/**
 * Fixtures several plugin test files need at the package root: entry stubs flare() scans for and
 * a `dist/` the resolver checks. One owner for the whole run — per-file create/delete raced when
 * files ran in parallel (one file deleted them while another still used them).
 */
import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const created: { dirs: string[]; files: string[] } = { dirs: [], files: [] };

export function setup(): void {
	for (const name of ["src/client.tsx", "src/server.ts", "src/custom.client.tsx", "src/custom.server.ts"]) {
		const p = join(process.cwd(), name);
		if (!existsSync(p)) {
			writeFileSync(p, "/* test stub */");
			created.files.push(p);
		}
	}
	const dist = join(process.cwd(), "dist");
	if (!existsSync(dist)) {
		mkdirSync(dist, { recursive: true });
		created.dirs.push(dist);
	}
}

export function teardown(): void {
	for (const p of created.files) {
		try {
			unlinkSync(p);
		} catch {
			/* already gone */
		}
	}
	for (const d of created.dirs) {
		try {
			rmdirSync(d);
		} catch {
			/* not empty or gone */
		}
	}
}
