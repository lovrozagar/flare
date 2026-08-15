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

export function buildServerTimingHeader(entries: TimingEntry[]): string {
	return entries.map((e) => `${e.name};dur=${e.dur.toFixed(1)}`).join(", ");
}
