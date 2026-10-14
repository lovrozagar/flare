import { expect, it } from "vitest";
import { crashWatch, navigationLog } from "../e2e/crash.ts";
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

// The navigation log records each page's main-frame navigations, not a child frame's, and its document requests, not a
// script's, for the pages a context has and opens later, each timed from the watch's start (BUGS.md 34.6).
it("navigation log", () => {
	type Handlers = {
		framenavigated: ((frame: { url(): string; parentFrame(): unknown }) => void)[];
		request: ((request: { url(): string; resourceType(): string }) => void)[];
	};
	const page = () => {
		const handlers: Handlers = { framenavigated: [], request: [] };
		return {
			handlers,
			on: (event: keyof Handlers, listener: never) => void handlers[event].push(listener),
		};
	};
	const first = page();
	const opened: ((value: ReturnType<typeof page>) => void)[] = [];
	const context = {
		pages: () => [first],
		on: (_event: "page", listener: (value: ReturnType<typeof page>) => void) => void opened.push(listener),
	};
	let clock = 100;
	const log = navigationLog(context, () => clock);
	clock = 112;
	for (const run of first.handlers.framenavigated) run({ url: () => "http://host/", parentFrame: () => null });
	for (const run of first.handlers.framenavigated) run({ url: () => "http://host/frame", parentFrame: () => ({}) });
	for (const run of first.handlers.request) run({ url: () => "http://host/a.js", resourceType: () => "script" });
	const later = page();
	for (const listener of opened) listener(later);
	clock = 150;
	for (const run of later.handlers.request) run({ url: () => "http://host/b", resourceType: () => "document" });
	expect(log()).toEqual(["12 framenavigated http://host/", "50 document http://host/b"]);
});
