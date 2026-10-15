import { expect, it, vi } from "vitest"
import { createLogger } from "./logger.ts"

function spy() {
	const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
	const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
	return { error, warn, log, restore: () => vi.restoreAllMocks() }
}

it("dev warn", () => {
	const calls = spy()
	const logger = createLogger({ dev: true })
	logger.warn("cache", "stale")
	logger.log("cache", "note")
	expect(logger.level).toBe("warn")
	expect(calls.warn).toHaveBeenCalledWith("[flare:cache]", "stale")
	expect(calls.log).toHaveBeenCalledWith("[flare:cache]", "note")
	calls.restore()
})

it("prod error", () => {
	const calls = spy()
	const logger = createLogger({ dev: false })
	logger.warn("store", "missing")
	logger.error("boundary", "digest")
	expect(logger.level).toBe("error")
	expect(calls.warn).not.toHaveBeenCalled()
	expect(calls.error).toHaveBeenCalledWith("[flare:boundary]", "digest")
	calls.restore()
})

it("format", () => {
	const calls = spy()
	const logger = createLogger({ dev: true })
	logger.error("auth", "denied", { id: "1" })
	logger.warn("auth", "missing")
	logger.log("auth", "ok")
	expect(calls.error).toHaveBeenCalledWith("[flare:auth]", "denied", { id: "1" })
	expect(calls.warn).toHaveBeenCalledWith("[flare:auth]", "missing")
	expect(calls.log).toHaveBeenCalledWith("[flare:auth]", "ok")
	calls.restore()
})
