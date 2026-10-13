import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterEach, expect, it, vi } from "vitest";
import { devWarn } from "./warn.ts";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

it("dev warns", () => {
	vi.stubEnv("DEV", true);
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	devWarn("server-fn", "m");
	expect(warn).toHaveBeenCalledExactlyOnceWith("[flare:server-fn] m");
});

// A production build replaces `import.meta.env.DEV` with false, so the warning and its console call are dropped.
// Vite reads production from NODE_ENV, which vitest sets to `test`, so the test sets it as a production build does.
it("prod silent", async () => {
	vi.stubEnv("DEV", false);
	vi.stubEnv("NODE_ENV", "production");
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	devWarn("server-fn", "m");
	expect(warn).not.toHaveBeenCalled();
	const dir = mkdtempSync(join(tmpdir(), "flare-dev-warn-"));
	try {
		const source = fileURLToPath(new URL("./warn.ts", import.meta.url));
		const entry = join(dir, "entry.ts");
		writeFileSync(
			entry,
			`import { devWarn } from ${JSON.stringify(source)};\nexport const run = () => devWarn("a", "b");\n`,
		);
		const result = await build({
			configFile: false,
			logLevel: "silent",
			root: dir,
			mode: "production",
			build: {
				write: false,
				lib: { entry, formats: ["es"], fileName: "entry" },
				rolldownOptions: { output: { minify: true } },
			},
		});
		const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) =>
			"output" in item ? item.output : [],
		);
		const code = outputs.map((item) => (item.type === "chunk" ? item.code : "")).join("");
		expect(code).toContain("run");
		expect(code).not.toContain("console");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
