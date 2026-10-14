import { expect, test as base } from "@playwright/test";

// A page as the crash watch reads it, and the context that opens pages.
type CrashPage = { on(event: "crash", listener: () => void): unknown; url(): string };
type Watched = { pages(): readonly CrashPage[]; on(event: "page", listener: (page: CrashPage) => void): unknown };

// Every page the context has or opens is watched for a renderer crash. The returned check throws when one crashed,
// naming its URL, so a crash fails the case that owned the page even when the case never touched the page again
// (plan 14 leaf 4.6).
export function crashWatch(context: Watched): () => void {
	const crashed: string[] = [];
	const watch = (page: CrashPage): void => void page.on("crash", () => crashed.push(page.url()));
	for (const page of context.pages()) watch(page);
	context.on("page", watch);
	return () => {
		if (crashed.length > 0) throw new Error(`A page crashed: ${crashed.join(", ")}`);
	};
}

// Every e2e spec's `test`: the crash watch runs around each case on its own context.
export const test = base.extend<{ crashGuard: void }>({
	crashGuard: [
		async ({ context }, use) => {
			const check = crashWatch(context);
			await use();
			check();
		},
		{ auto: true },
	],
});

export { expect };
