import type { FlareSpan, FlareTracer } from "./types.ts";

const noopSpan: FlareSpan = {
	end() {},
	setAttribute() {},
	setStatus() {},
};

export const noopTracer: FlareTracer = {
	startSpan() {
		return noopSpan;
	},
};
