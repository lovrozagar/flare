/** @vitest-environment node */
import { resolve } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";

/* Modules apps import outside Flare's Vite plugin (a component library's unit tests import `cn`)
   must not depend on Flare's virtual modules. The logger used to import virtual:flare-log-level,
   and `@lovrozagar/flare/styles` imports the logger. */
describe("standalone imports", () => {
	it("bundles @lovrozagar/flare/styles with plain Vite", async () => {
		const entry = resolve(import.meta.dirname, "../../../src/styles/index.ts");
		const output = await build({
			build: { lib: { entry, formats: ["es"] }, write: false },
			configFile: false,
			logLevel: "silent",
		});
		expect(output).toBeTruthy();
	}, 60_000);
});
