// The part of Playwright's `Page` the helper uses. Flare does not depend on Playwright; an app passes its own page.
export type FlarePageInput = {
	goto(url: string): Promise<unknown>;
	waitForSelector(selector: string, options?: { state?: "attached" }): Promise<unknown>;
	on(event: "console", listener: (message: { type(): string; text(): string }) => void): unknown;
	on(event: "pageerror", listener: (error: Error) => void): unknown;
	evaluate<T>(fn: () => T): Promise<T>;
};

// One match of `self.flare.matches` (B83).
export type FlareStateMatch = {
	id: string;
	params: unknown;
	search: unknown;
	data: unknown;
	preloader: unknown;
	head: unknown;
	error: unknown;
};

export type FlareState = { build: string; nonce: string; matches: FlareStateMatch[]; queries: unknown };

export type FlarePage = {
	load(path?: string): Promise<void>;
	consoleErrors(): string[];
	state(): Promise<FlareState>;
};

// Solid's hydration-mismatch texts. Every other error, a thrown `Error` included, is kept.
const MISMATCH = /^Hydration (Mismatch\.|tag mismatch|structure mismatch|key miss)/;
const MATCH_KEYS = ["id", "params", "search", "data", "preloader", "head", "error"];
const BAD_STATE = "self.flare is not Flare's document state: { build, nonce, matches, queries }";

function isMatch(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	return MATCH_KEYS.every((key) => key in value) && typeof Reflect.get(value, "id") === "string";
}

function stateOf(value: unknown): FlareState {
	const flare: object = Object(value);
	const build: unknown = Reflect.get(flare, "build");
	const nonce: unknown = Reflect.get(flare, "nonce");
	const matches: unknown = Reflect.get(flare, "matches");
	if (typeof build !== "string" || typeof nonce !== "string" || !Array.isArray(matches)) throw new Error(BAD_STATE);
	const checked: FlareStateMatch[] = [];
	for (const match of matches) {
		if (!isMatch(match)) throw new Error(BAD_STATE);
		checked.push({
			id: String(Reflect.get(match, "id")),
			params: Reflect.get(match, "params"),
			search: Reflect.get(match, "search"),
			data: Reflect.get(match, "data"),
			preloader: Reflect.get(match, "preloader"),
			head: Reflect.get(match, "head"),
			error: Reflect.get(match, "error"),
		});
	}
	return { build, nonce, matches: checked, queries: Reflect.get(flare, "queries") };
}

// Playwright helpers for an app's e2e (dx/testing.md). Errors are collected from the moment the helper is made.
export function flarePage(page: FlarePageInput): FlarePage {
	const errors: string[] = [];
	const keep = (text: string): void => {
		if (!MISMATCH.test(text)) errors.push(text);
	};
	page.on("console", (message) => {
		if (message.type() === "error") keep(message.text());
	});
	page.on("pageerror", (error) => keep(error.message));
	return {
		async load(path = "/") {
			await page.goto(path);
			await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" });
		},
		consoleErrors: () => [...errors],
		async state() {
			return stateOf(await page.evaluate(() => Reflect.get(globalThis, "flare")));
		},
	};
}
