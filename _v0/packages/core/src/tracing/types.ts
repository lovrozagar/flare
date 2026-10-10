export interface FlareSpan {
	end(): void;
	setAttribute(key: string, value: boolean | number | string): void;
	setStatus(status: "error" | "ok"): void;
}

export interface FlareTracer {
	startSpan(name: string): FlareSpan;
}
