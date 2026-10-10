import type { FlareSpan, FlareTracer } from "./types.ts";

/**
 * Minimal subset of the OpenTelemetry Tracer API that Flare consumes.
 * Users pass their real OTel tracer — this avoids a hard dependency on @opentelemetry/*.
 */
export interface OtelTracerLike {
	startSpan(name: string): OtelSpanLike;
}

export interface OtelSpanLike {
	end(): void;
	setAttribute(key: string, value: boolean | number | string): void;
	setStatus(status: { code: number; message?: string }): void;
}

/** OTel StatusCode.ERROR = 2, StatusCode.OK = 1 */
const STATUS_MAP: Record<"error" | "ok", number> = { error: 2, ok: 1 };

export function createOtelTracer(provider: OtelTracerLike): FlareTracer {
	return {
		startSpan(name: string): FlareSpan {
			const span = provider.startSpan(name);
			return {
				end() {
					span.end();
				},
				setAttribute(key: string, value: boolean | number | string) {
					span.setAttribute(key, value);
				},
				setStatus(status: "error" | "ok") {
					span.setStatus({ code: STATUS_MAP[status] });
				},
			};
		},
	};
}
