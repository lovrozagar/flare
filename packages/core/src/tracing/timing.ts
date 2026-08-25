import type { FlareSpan, FlareTracer } from "./types.ts";

export interface TimingEntry {
	dur: number;
	name: string;
}

export interface TimingTracer extends FlareTracer {
	getEntries(): TimingEntry[];
}

export function createTimingTracer(): TimingTracer {
	const entries: TimingEntry[] = [];

	return {
		getEntries() {
			return entries;
		},
		startSpan(name: string): FlareSpan {
			const start = performance.now();
			return {
				end() {
					entries.push({ dur: performance.now() - start, name });
				},
				setAttribute() {},
				setStatus() {},
			};
		},
	};
}

/* Server-Timing `name` is an RFC 7230 token — no `:`, `/`, or spaces. */
function timingToken(name: string): string {
	return name.replace(/[^0-9A-Za-z!#$%&'*+\-.^_`|~]/g, ".");
}

export function buildServerTimingHeader(entries: TimingEntry[]): string {
	return entries.map((e) => `${timingToken(e.name)};dur=${e.dur.toFixed(1)}`).join(", ");
}
