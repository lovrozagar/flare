import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { preload } from "../../../src/preload/index.ts"

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
})

function createLoader<T>(value: T) {
	return vi.fn(() => Promise.resolve({ default: value }))
}

function createFailingLoader(error = new Error("load failed")) {
	let calls = 0
	return {
		calls: () => calls,
		loader: vi.fn(() => {
			calls++
			return Promise.reject(error)
		}),
	}
}

describe("preload (fire-and-forget)", () => {
	it("starts loading without waiting", () => {
		const loader = createLoader("result")
		const p = preload({ loader })
		p.preload()
		expect(loader).toHaveBeenCalledOnce()
	})

	it("no unhandled rejection on error", async () => {
		const { loader } = createFailingLoader()
		const p = preload({ loader })
		p.preload()
		await vi.advanceTimersByTimeAsync(2000)
	})

	it("second preload call is no-op", () => {
		const loader = createLoader("result")
		const p = preload({ loader })
		p.preload()
		p.preload()
		expect(loader).toHaveBeenCalledOnce()
	})
})

describe("load", () => {
	it("returns default export", async () => {
		const p = preload({ loader: createLoader("hello") })
		const result = await p.load()
		expect(result).toBe("hello")
	})

	it("caches promise across calls", async () => {
		const loader = createLoader("cached")
		const p = preload({ loader })
		const a = p.load()
		const b = p.load()
		expect(loader).toHaveBeenCalledOnce()
		expect(await a).toBe("cached")
		expect(await b).toBe("cached")
	})

	it("concurrent calls return same promise", () => {
		const loader = createLoader("same")
		const p = preload({ loader })
		const a = p.load()
		const b = p.load()
		expect(a).toBe(b)
	})
})

describe("retry", () => {
	it("first failure retries after 1s", async () => {
		let attempt = 0
		const loader = vi.fn(() => {
			attempt++
			if (attempt === 1) return Promise.reject(new Error("fail"))
			return Promise.resolve({ default: "recovered" })
		})
		const p = preload({ loader })
		const promise = p.load()

		/* first attempt fails immediately */
		await vi.advanceTimersByTimeAsync(0)
		expect(loader).toHaveBeenCalledOnce()

		/* retry after 1s */
		await vi.advanceTimersByTimeAsync(1000)
		expect(loader).toHaveBeenCalledTimes(2)

		const result = await promise
		expect(result).toBe("recovered")
	})

	it("second failure with throws: false resolves undefined", async () => {
		const { loader } = createFailingLoader()
		const p = preload({ loader, throws: false })
		const promise = p.load()

		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(1000)
		await vi.advanceTimersByTimeAsync(0)

		const result = await promise
		expect(result).toBeUndefined()
	})

	it("second failure with throws: true rejects", async () => {
		const error = new Error("fatal")
		const { loader } = createFailingLoader(error)
		const p = preload({ loader, throws: true })
		const promise = p.load()

		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(1000)
		await vi.advanceTimersByTimeAsync(0)

		await expect(promise).rejects.toThrow("fatal")
	})

	it("cache cleared after exhausted retries", async () => {
		let attempt = 0
		const loader = vi.fn(() => {
			attempt++
			if (attempt <= 2) return Promise.reject(new Error("fail"))
			return Promise.resolve({ default: "fresh" })
		})
		const p = preload({ loader })

		/* exhaust retries */
		const first = p.load()
		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(1000)
		await vi.advanceTimersByTimeAsync(0)
		await first

		/* next load starts fresh */
		const second = p.load()
		const result = await second
		expect(result).toBe("fresh")
		expect(loader).toHaveBeenCalledTimes(3)
	})
})

describe("reset", () => {
	it("clears cached promise", async () => {
		const loader = createLoader("first")
		const p = preload({ loader })
		await p.load()
		expect(loader).toHaveBeenCalledOnce()

		p.reset()
		await p.load()
		expect(loader).toHaveBeenCalledTimes(2)
	})

	it("reset during retry discards stale retry", async () => {
		let _attempt = 0
		const loader = vi.fn(() => {
			_attempt++
			return Promise.reject(new Error("fail"))
		})
		const p = preload({ loader, throws: false })

		/* Start load — first attempt fails immediately */
		const promise = p.load()
		await vi.advanceTimersByTimeAsync(0)
		expect(loader).toHaveBeenCalledOnce()

		/* Reset before retry fires — bumps generation */
		p.reset()

		/* Advance past retry delay — stale retry resolves undefined */
		await vi.advanceTimersByTimeAsync(1000)

		/* Stale retry should NOT have called loader again (generation mismatch) */
		expect(loader).toHaveBeenCalledOnce()

		const result = await promise
		expect(result).toBeUndefined()
	})

	it("reset then new load uses fresh generation", async () => {
		let attempt = 0
		const loader = vi.fn(() => {
			attempt++
			if (attempt <= 2) return Promise.reject(new Error("fail"))
			return Promise.resolve({ default: "fresh" })
		})
		const p = preload({ loader, throws: false })

		/* Start and fail first load */
		const first = p.load()
		await vi.advanceTimersByTimeAsync(0)

		/* Reset mid-retry */
		p.reset()
		await vi.advanceTimersByTimeAsync(1000)
		await first

		/* New load with fresh generation succeeds */
		attempt = 2
		const second = p.load()
		const result = await second
		expect(result).toBe("fresh")
	})

	it("resets retry counter", async () => {
		let attempt = 0
		const loader = vi.fn(() => {
			attempt++
			if (attempt <= 2) return Promise.reject(new Error("fail"))
			return Promise.resolve({ default: "ok" })
		})
		const p = preload({ loader, throws: true })

		const first = p.load()
		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(1000)
		await vi.advanceTimersByTimeAsync(0)
		await expect(first).rejects.toThrow()

		/* reset and try again — fresh retry budget */
		attempt = 0
		p.reset()
		const second = p.load()
		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(1000)
		await vi.advanceTimersByTimeAsync(0)
		await expect(second).rejects.toThrow()
		expect(loader).toHaveBeenCalledTimes(4)
	})
})
