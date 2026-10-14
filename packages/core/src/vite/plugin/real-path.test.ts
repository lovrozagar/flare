import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { realPath } from "./real-path.ts";

// A path through a symlink is its real path, the form Vite gives module ids in. A missing path stays as given, so the
// caller's own error names what the user wrote (BUGS.md B51).
it("real path", () => {
	const real = realpathSync(mkdtempSync(join(tmpdir(), "flare-real-")));
	const link = `${real}-link`;
	symlinkSync(real, link);
	try {
		expect(realPath(link)).toBe(real);
		expect(realPath(real)).toBe(real);
		expect(realPath(join(link, "missing"))).toBe(join(link, "missing"));
	} finally {
		rmSync(link, { force: true });
		rmSync(real, { recursive: true, force: true });
	}
});
