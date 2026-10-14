import { createServerFn } from "@lovrozagar/flare/server-fn";

// Each run's outcome, so the page can ask whether the server saw the stop. Server process memory only.
const runs = new Map<string, "running" | "done" | "aborted">();

const STEPS = ["resolve routes", "bundle client", "bundle server", "prerender pages", "write sitemap", "done"];

// The longest a held run waits after its second line for the client to stop it.
const HOLD_MS = 10_000;

// One line every 150 ms. Stopping the iterator on the client aborts the request, and `signal` tells the server. A
// held run (`hold`) waits after its second line until the stop arrives, so a stop clicked late on a slow machine
// still meets a running stream, and a stop that never reaches the server ends as `done` after HOLD_MS (BUGS.md B55).
export const buildLog = createServerFn()
	.input({
		parse: (value: { run: string; hold?: boolean }) => ({
			run: String(value.run).slice(0, 16),
			hold: value.hold === true,
		}),
	})
	.stream(async function* ({ input, signal }) {
		runs.set(input.run, "running");
		signal.addEventListener("abort", () => runs.set(input.run, "aborted"), { once: true });
		for (const [index, step] of STEPS.entries()) {
			if (signal.aborted) return;
			await new Promise((resolve) => setTimeout(resolve, 150));
			yield { line: index + 1, step };
			if (input.hold && index === 1) await stopped(signal);
		}
		runs.set(input.run, "done");
	});

function stopped(signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, HOLD_MS);
		signal.addEventListener("abort", () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

export const buildStatus = createServerFn({ method: "get" })
	.input({ parse: (value: { run: string }) => ({ run: String(value.run) }) })
	.handler(({ input }) => ({ run: input.run, status: runs.get(input.run) ?? "unknown" }));
