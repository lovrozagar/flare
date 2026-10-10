/** @vitest-environment node */
/* sx.strict on a real build: an unknown class literal fails `vite build`; allowing it builds. */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { copyUiContractApp, type UiContractApp } from "./ui-contract-app.ts";

let app: UiContractApp;
beforeAll(async () => {
	app = await copyUiContractApp("strict");
});
afterAll(() => app.dispose());

afterEach(async () => {
	delete process.env.FLARE_STRICT_ALLOW;
	await rm(join(app.root, "dist"), { recursive: true, force: true });
});

function buildStrict() {
	return build({ configFile: join(app.root, "vite.strict.config.ts"), logLevel: "silent", root: app.root });
}

describe("sx.strict build", () => {
	it("rejects the build, naming the unknown token and its file", async () => {
		await expect(buildStrict()).rejects.toThrow(/routes\/index\.tsx:\d+.*"bg-blue-500"/s);
	}, 180_000);

	it("builds once the app's deliberate unknown tokens are allowed", async () => {
		process.env.FLARE_STRICT_ALLOW = "bg-blue-500,text-surface";
		await expect(buildStrict()).resolves.toBeDefined();
	}, 180_000);
});
