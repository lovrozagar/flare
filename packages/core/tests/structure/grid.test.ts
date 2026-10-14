import { expect, it } from "vitest";
import config from "../e2e/playwright.config.ts";

// With no `--project`, the e2e config runs all 18 projects on any machine, Linux or macOS: the browsers come from the
// pinned image, so the OS does not choose them (B70, B97). Each project names its server and its engine.
it("grid projects", () => {
	const projects = (config.projects ?? []).map((project) => [project.name, project.use?.browserName]);
	const servers = ["node-dev", "node-prod", "bun-dev", "bun-prod", "workers-dev", "workers-prod"];
	expect(projects).toEqual(
		servers.flatMap((server) =>
			(["chromium", "firefox", "webkit"] as const).map((engine) => [`${server}-${engine}`, engine]),
		),
	);
	expect(config.globalSetup).toBe("./global-setup.ts");
});
