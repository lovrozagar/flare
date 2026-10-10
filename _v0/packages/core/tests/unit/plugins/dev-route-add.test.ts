/** @vitest-environment node */
/*
 * A route file added while `vite dev` runs regenerates `_gen/routes.gen.ts`. The dev server must
 * pick that up: SSR renders the new route, and the client is served the new route tree, without a
 * restart.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DevApp, startDevApp } from "../../dev-app.ts";

const apps: DevApp[] = [];

afterEach(async () => {
	for (const app of apps.splice(0)) await app.close();
});

const aboutPage =
	'import { createPage } from "@lovrozagar/flare/page";\n\n' +
	'export const route = createPage("_root_/about").render(() => <p data-testid="about-page">about</p>);\n';

describe("dev route added at runtime", () => {
	it("is rendered by SSR and listed in the client route tree", async () => {
		const app = await startDevApp({ watch: true });
		apps.push(app);
		expect(await app.get("/about")).not.toContain("about-page");
		expect(await app.get("/src/_gen/routes.gen.ts")).not.toContain("routes/about");

		writeFileSync(join(app.app, "src/routes/about.tsx"), aboutPage);

		await vi.waitFor(async () => expect(await app.get("/about")).toContain('data-testid="about-page"'), {
			timeout: 15_000,
		});
		expect(await app.get("/src/_gen/routes.gen.ts")).toContain("routes/about");
	}, 120_000);
});
