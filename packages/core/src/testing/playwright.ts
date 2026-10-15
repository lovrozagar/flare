// The part of Playwright's `Page` the helper uses. Flare does not depend on Playwright; an app passes its own page.
export type FlarePageInput = {
	goto(url: string): Promise<unknown>;
	locator(selector: string): { waitFor(options: { state: "attached"; timeout: number }): Promise<unknown> };
	exposeBinding(name: string, callback: () => void): Promise<unknown>;
	addInitScript(script: (name: string) => void, arg: string): Promise<unknown>;
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

const MATCH_KEYS = ["id", "params", "search", "data", "preloader", "head", "error"];
const BAD_STATE = "self.flare is not Flare's document state: { build, nonce, matches, queries }";
const HYDRATED = "html[data-flare-hydrated]";

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

// Playwright helpers for an app's e2e (dx/testing.md). Every console error and page error is collected from the
// moment the helper is made, a hydration mismatch included.
export function flarePage(page: FlarePageInput): FlarePage {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => void errors.push(error.message));
	return {
		load: (path = "/") => loadHydrated(page, path, { onReissue: warnReissue(path) }),
		consoleErrors: () => [...errors],
		async state() {
			return stateOf(await page.evaluate(() => Reflect.get(globalThis, "flare")));
		},
	};
}

function warnReissue(path: string): (attempt: number) => void {
	return (attempt) =>
		console.warn(`[flare] flarePage.load("${path}"): no hydration answer yet, query ${attempt + 1} sent`);
}

export type HydrationWait = {
	// The whole wait; past it the page never hydrated.
	deadline?: number;
	// One selector query's share before a fresh one is sent.
	slice?: number;
	// Told each re-issue, so a run that needed one says so.
	onReissue?: (attempt: number) => void;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
};

// `goto`, then wait for hydrate on two channels (BUGS.md 107). Playwright's Firefox driver sometimes loses one reply,
// so a single query can hang after the page hydrated. The page calls an exposed binding when `data-flare-hydrated`
// appears, and a locator's `waitFor` runs in slices, each sent again as a fresh query when its slice
// ends, under a timer of the wait's own, so no lost reply holds it. A page that never hydrates still fails, at the
// deadline.
export async function loadHydrated(page: FlarePageInput, path: string, wait: HydrationWait = {}): Promise<void> {
	const signal = await hydrationSignal(page);
	const hydrated = signal.next();
	await page.goto(path);
	await waitHydrated(page, hydrated, wait);
}

const signals = new WeakMap<FlarePageInput, { next: () => Promise<void> }>();

// One binding, under a name no app uses, and one init script per page: a second load on the page reuses them.
// `next()` resolves at the next hydration the page's top frame reports, so the load arms it before its `goto`.
async function hydrationSignal(page: FlarePageInput): Promise<{ next: () => Promise<void> }> {
	const known = signals.get(page);
	if (known !== undefined) return known;
	// The load waiting now; a newer `next()` replaces it.
	const waiting: (() => void)[] = [];
	const signal = { next: () => new Promise<void>((done) => void waiting.splice(0, 1, done)) };
	signals.set(page, signal);
	const name = `__flare_hydrated_${crypto.randomUUID().replaceAll("-", "")}`;
	await page.exposeBinding(name, () => {
		for (const done of waiting.splice(0)) done();
	});
	await page.addInitScript(reportHydrated, name);
	return signal;
}

// Runs in the page before its scripts. Chromium and WebKit have no `documentElement` yet then, so it observes the
// document.
function reportHydrated(name: string): void {
	if (window !== window.top) return;
	new MutationObserver((_records, observer) => {
		if (!document.documentElement.hasAttribute("data-flare-hydrated")) return;
		observer.disconnect();
		void Reflect.get(window, name)();
	}).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-flare-hydrated"] });
}

export async function waitHydrated(
	page: Pick<FlarePageInput, "locator">,
	binding: Promise<void>,
	wait: HydrationWait = {},
): Promise<void> {
	const { deadline = 25_000, slice = 5000, onReissue = () => undefined } = wait;
	const sleep = wait.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
	const now = wait.now ?? Date.now;
	const start = now();
	const fired = binding.then(() => true);
	for (let attempt = 1; ; attempt += 1) {
		const left = deadline - (now() - start);
		if (left <= 0) throw new Error(`The page never hydrated: no ${HYDRATED} within ${deadline} ms`);
		const share = Math.min(slice, left);
		// A locator's wait returns no element handle, so a query still in flight when the case ends leaves none to bind.
		const found = page
			.locator(HYDRATED)
			.waitFor({ state: "attached", timeout: share })
			.then(
				() => true,
				() => false,
			);
		// The driver ends the query at its timeout; the wait's own timer ends the slice if that answer is lost too.
		if (await Promise.race([found, fired, sleep(share + 1000).then(() => false)])) return;
		onReissue(attempt);
	}
}
