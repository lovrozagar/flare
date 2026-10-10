/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { buildServerTimingHeader, createTimingTracer } from "../../../src/tracing/timing.ts";

describe("Server-Timing via timing tracer", () => {
	it("buildServerTimingHeader produces per-phase entries", () => {
		const header = buildServerTimingHeader([
			{ dur: 0.5, name: "flare.pipeline.validation" },
			{ dur: 1.2, name: "flare.pipeline.authenticate" },
			{ dur: 3.4, name: "flare.pipeline.preload_authorize" },
			{ dur: 10.1, name: "flare.pipeline.loaders" },
			{ dur: 0.3, name: "flare.pipeline.head" },
			{ dur: 0.2, name: "flare.pipeline.headers" },
		]);

		expect(header).toContain("flare.pipeline.validation;dur=0.5");
		expect(header).toContain("flare.pipeline.authenticate;dur=1.2");
		expect(header).toContain("flare.pipeline.preload_authorize;dur=3.4");
		expect(header).toContain("flare.pipeline.loaders;dur=10.1");
		expect(header).toContain("flare.pipeline.head;dur=0.3");
		expect(header).toContain("flare.pipeline.headers;dur=0.2");
	});

	it("timing tracer records durations with reasonable values", () => {
		const tracer = createTimingTracer();

		const span1 = tracer.startSpan("flare.pipeline.validation");
		span1.end();

		const span2 = tracer.startSpan("flare.pipeline.loaders");
		span2.end();

		const entries = tracer.getEntries();
		expect(entries).toHaveLength(2);
		for (const entry of entries) {
			expect(entry.dur).toBeGreaterThanOrEqual(0);
			expect(entry.dur).toBeLessThan(1000);
		}
	});

	it("header format matches multi-entry Server-Timing spec", () => {
		const header = buildServerTimingHeader([
			{ dur: 1.0, name: "flare.pipeline.validation" },
			{ dur: 2.5, name: "flare.pipeline.loaders" },
		]);

		expect(header).toMatch(/^[\w.]+;dur=[\d.]+, [\w.]+;dur=[\d.]+$/);
	});

	it("getEntries returns entries for timing tracer", () => {
		const tracer = createTimingTracer();
		expect("getEntries" in tracer).toBe(true);
		expect(tracer.getEntries()).toEqual([]);

		tracer.startSpan("test").end();
		expect(tracer.getEntries()).toHaveLength(1);
	});
});
