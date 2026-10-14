import { expect, it } from "vitest";
import { crashWatch } from "../e2e/crash.ts";
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

// A page that crashes fails the case that owned it: the watch covers the pages a context already has and every page
// it opens later, and its check names the crashed URL (plan 14 leaf 4.6).
it("crash fails", () => {
	type Listener = () => void;
	const page = (url: string) => {
		const listeners: Listener[] = [];
		return {
			on: (_event: "crash", listener: Listener) => listeners.push(listener),
			url: () => url,
			crash: () => listeners.forEach((run) => run()),
		};
	};
	const first = page("http://host/a");
	const opened: ((value: ReturnType<typeof page>) => void)[] = [];
	const context = {
		pages: () => [first],
		on: (_event: "page", listener: (value: ReturnType<typeof page>) => void) => opened.push(listener),
	};
	const check = crashWatch(context);
	expect(check).not.toThrow();
	const later = page("http://host/b");
	for (const listener of opened) listener(later);
	later.crash();
	expect(check).toThrow("A page crashed: http://host/b");
	first.crash();
	expect(check).toThrow("A page crashed: http://host/b, http://host/a");
});
