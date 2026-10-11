import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const budgetPath = new URL("./budget.json", import.meta.url);

it("createPage alone", async () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-size-"));
	try {
		const entry = join(dir, "entry.ts");
		const page = fileURLToPath(new URL("../../src/shared/route-builder/page.ts", import.meta.url));
		writeFileSync(entry, `import { createPage } from ${JSON.stringify(page)};\nexport const page = createPage;\n`);
		const built = spawnSync("bun", ["build", entry, "--outdir", dir, "--format=esm"], { encoding: "utf8" });
		expect(built.status).toBe(0);
		const output = readFileSync(join(dir, "entry.js"), "utf8");
		expect(output).not.toContain("client/navigation");
		const budget = JSON.parse(readFileSync(budgetPath, "utf8")) as Record<string, number>;
		expect(budget.createPage).toBeTypeOf("number");
		expect(gzipSync(output).length).toBeLessThanOrEqual(budget.createPage);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
