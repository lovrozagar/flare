import { createServerFn } from "@lovrozagar/flare/server-fn";

// Each run's outcome, so the page can ask whether the server saw the stop. Server process memory only.
const runs = new Map<string, "running" | "done" | "aborted">();

const STEPS = ["resolve routes", "bundle client", "bundle server", "prerender pages", "write sitemap", "done"];

// One line every 150 ms. Stopping the iterator on the client aborts the request, and `signal` tells the server.
export const buildLog = createServerFn()
	.input({ parse: (value: { run: string }) => ({ run: String(value.run).slice(0, 16) }) })
	.stream(async function* ({ input, signal }) {
		runs.set(input.run, "running");
		signal.addEventListener("abort", () => runs.set(input.run, "aborted"), { once: true });
		for (const [index, step] of STEPS.entries()) {
			if (signal.aborted) return;
			await new Promise((resolve) => setTimeout(resolve, 150));
			yield { line: index + 1, step };
		}
		runs.set(input.run, "done");
	});

export const buildStatus = createServerFn({ method: "get" })
	.input({ parse: (value: { run: string }) => ({ run: String(value.run) }) })
	.handler(({ input }) => ({ run: input.run, status: runs.get(input.run) ?? "unknown" }));
