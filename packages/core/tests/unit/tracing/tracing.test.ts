import { describe, expect, it, vi } from "vitest"
import { noopTracer } from "../../../src/tracing/noop.ts"
import { createOtelTracer } from "../../../src/tracing/otel.ts"
import { buildServerTimingHeader, createTimingTracer } from "../../../src/tracing/timing.ts"

describe("noopTracer", () => {
	it("startSpan returns a span that does not throw", () => {
		const span = noopTracer.startSpan("test")
		expect(() => {
			span.setAttribute("key", "value")
			span.setStatus("ok")
			span.end()
		}).not.toThrow()
	})

	it("returns the same singleton span", () => {
		const a = noopTracer.startSpan("a")
		const b = noopTracer.startSpan("b")
		expect(a).toBe(b)
	})
})

describe("createTimingTracer", () => {
	it("records durations for spans", () => {
		const tracer = createTimingTracer()
		const span = tracer.startSpan("flare.pipeline.validation")
		span.end()

		const entries = tracer.getEntries()
		expect(entries).toHaveLength(1)
		expect(entries[0]?.name).toBe("flare.pipeline.validation")
		expect(typeof entries[0]?.dur).toBe("number")
		expect(entries[0]?.dur).toBeGreaterThanOrEqual(0)
	})

	it("records multiple spans in order", () => {
		const tracer = createTimingTracer()
		tracer.startSpan("a").end()
		tracer.startSpan("b").end()
		tracer.startSpan("c").end()

		const entries = tracer.getEntries()
		expect(entries).toHaveLength(3)
		expect(entries.map((e) => e.name)).toEqual(["a", "b", "c"])
	})

	it("setAttribute and setStatus do not throw", () => {
		const tracer = createTimingTracer()
		const span = tracer.startSpan("test")
		expect(() => {
			span.setAttribute("cache", true)
			span.setStatus("error")
			span.end()
		}).not.toThrow()
	})
})

describe("buildServerTimingHeader", () => {
	it("builds comma-separated header from entries", () => {
		const header = buildServerTimingHeader([
			{ dur: 1.234, name: "a" },
			{ dur: 0.5, name: "b" },
		])
		expect(header).toBe("a;dur=1.2, b;dur=0.5")
	})

	it("returns empty string for no entries", () => {
		expect(buildServerTimingHeader([])).toBe("")
	})
})

describe("createOtelTracer", () => {
	it("forwards startSpan to provider", () => {
		const mockSpan = {
			end: vi.fn(),
			setAttribute: vi.fn(),
			setStatus: vi.fn(),
		}
		const provider = { startSpan: vi.fn(() => mockSpan) }

		const tracer = createOtelTracer(provider)
		const span = tracer.startSpan("test-span")

		expect(provider.startSpan).toHaveBeenCalledWith("test-span")

		span.setAttribute("key", 42)
		expect(mockSpan.setAttribute).toHaveBeenCalledWith("key", 42)

		span.setStatus("error")
		expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2 })

		span.setStatus("ok")
		expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 })

		span.end()
		expect(mockSpan.end).toHaveBeenCalled()
	})
})
