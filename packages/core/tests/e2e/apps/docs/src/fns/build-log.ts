import { createServerFn } from "@lovrozagar/flare/server-fn";
import { e2eBoot } from "../stats-gate.ts";

// Each run's outcome, so the page can ask whether the server saw the stop. Server process memory only.
const runs = new Map<string, "running" | "done" | "aborted">();

const STEPS = ["resolve routes", "bundle client", "bundle server", "prerender pages", "write sitemap", "done"];

// The longest a held run waits after its second line for the client to stop it.
const HOLD_MS = 10_000;

// The e2e `stream` gate (BUGS.md 100): a gated run sends its first line, then each later line only after one release
// for it, so the test sees a line while the server still holds the next, with no clock. Server process memory only.
type Gate = { released: number };
const gates = new Map<string, Gate>();

const runInput = { parse: (value: { run: string }) => ({ run: String(value.run).slice(0, 16) }) };

// Gates a run before it starts. Outside the e2e boot it changes nothing, so no visitor can hold a build.
export const holdBuild = createServerFn()
	.input(runInput)
	.handler(({ input, env }) => {
		if (!e2eBoot(env)) return { held: false };
		gates.set(input.run, { released: 0 });
		return { held: true };
	});

// Lets a gated run send its next line.
export const releaseBuild = createServerFn()
	.input(runInput)
	.handler(({ input }) => {
		const gate = gates.get(input.run);
		if (gate === undefined) return { released: false };
		gate.released += 1;
		return { released: true };
	});

// One line every 150 ms, or, for a gated run, one line per release after the first. Stopping the iterator on the
// client aborts the request, and `signal` tells the server. A held run (`hold`) waits after its second line until the
// stop arrives, so a stop clicked late on a slow machine still meets a running stream, and a stop that never reaches
// the server ends as `done` after HOLD_MS (BUGS.md B55).
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
		const gate = gates.get(input.run);
		for (const [index, step] of STEPS.entries()) {
			if (signal.aborted) return;
			if (gate === undefined) await new Promise((resolve) => setTimeout(resolve, 150));
			else await released(gate, index, signal);
			if (signal.aborted) return;
			yield { line: index + 1, step };
			if (input.hold && index === 1) await stopped(signal);
		}
		gates.delete(input.run);
		runs.set(input.run, "done");
	});

// Resolves once the gate has `count` releases, or when the run is stopped. The run checks the count on its own timer:
// workerd cancels a request's continuation when another request resolves its promise, so the release only counts.
async function released(gate: Gate, count: number, signal: AbortSignal): Promise<void> {
	while (gate.released < count && !signal.aborted) await new Promise((resolve) => setTimeout(resolve, 10));
}

// Resolves when the run is stopped, at once when the stop already came, or after HOLD_MS.
function stopped(signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve();
			return;
		}
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
