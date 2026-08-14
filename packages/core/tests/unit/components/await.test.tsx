import { createRoot, createSignal } from "solid-js"
import { render } from "solid-js/web"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	Await,
	type Deferred,
	getPromise,
	getResolvedError,
	getResolvedValue,
	isDeferred,
} from "../../../src/components/index.ts"

function makeDeferred<T>(overrides?: Partial<Deferred<T>>): Deferred<T> {
	return {
		__deferred: true,
		promise: new Promise<T>(() => {}),
		...overrides,
	}
}

function tick(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0))
}

describe("isDeferred", () => {
	it("Deferred → true", () => {
		expect(isDeferred(makeDeferred())).toBe(true)
	})

	it("plain Promise → false", () => {
		expect(isDeferred(Promise.resolve(42))).toBe(false)
	})

	it("null → false", () => {
		expect(isDeferred(null)).toBe(false)
	})

	it("object without __deferred → false", () => {
		expect(isDeferred({ promise: Promise.resolve() })).toBe(false)
	})
})

describe("getPromise", () => {
	it("Deferred → returns inner promise", () => {
		const inner = Promise.resolve(42)
		const d = makeDeferred({ promise: inner })
		expect(getPromise(d)).toBe(inner)
	})

	it("plain Promise → returns itself", () => {
		const p = Promise.resolve(42)
		expect(getPromise(p)).toBe(p)
	})

	it("deferred marker without promise → undefined", () => {
		expect(getPromise({ __deferred: true } as Deferred<unknown>)).toBeUndefined()
	})

	it("null → undefined", () => {
		expect(getPromise(null)).toBeUndefined()
	})
})

describe("getResolvedValue", () => {
	it("Deferred with __resolved → returns value", () => {
		const d = makeDeferred<number>({ __resolved: 42 })
		expect(getResolvedValue(d)).toBe(42)
	})

	it("Deferred without __resolved → undefined", () => {
		expect(getResolvedValue(makeDeferred())).toBeUndefined()
	})

	it("plain Promise → undefined", () => {
		expect(getResolvedValue(Promise.resolve(42))).toBeUndefined()
	})
})

describe("getResolvedError", () => {
	it("Deferred with __error → returns Error", () => {
		const d = makeDeferred({ __error: { message: "boom" } })
		const err = getResolvedError(d)
		expect(err).toBeInstanceOf(Error)
		expect(err?.message).toBe("boom")
	})

	it("Deferred without __error → undefined", () => {
		expect(getResolvedError(makeDeferred())).toBeUndefined()
	})

	it("plain Promise → undefined", () => {
		expect(getResolvedError(Promise.resolve())).toBeUndefined()
	})
})

describe("Await component", () => {
	let container: HTMLDivElement
	let dispose: () => void

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		dispose?.()
		container.remove()
	})

	it("pending → renders pending slot", () => {
		const promise = new Promise<string>(() => {})

		dispose = render(
			() => (
				<Await pending={<span data-testid="loading">Loading...</span>} promise={promise}>
					{(data) => <span data-testid="data">{data}</span>}
				</Await>
			),
			container,
		)

		expect(container.querySelector("[data-testid='loading']")).not.toBeNull()
		expect(container.querySelector("[data-testid='data']")).toBeNull()
	})

	it("resolved → renders children with data", async () => {
		const promise = Promise.resolve("hello")

		dispose = render(
			() => (
				<Await pending={<span>Loading</span>} promise={promise}>
					{(data) => <span data-testid="data">{data}</span>}
				</Await>
			),
			container,
		)

		await tick()

		expect(container.querySelector("[data-testid='data']")?.textContent).toBe("hello")
	})

	it("error → renders error slot (async)", async () => {
		let rejectFn: (e: Error) => void = () => {}
		const promise = new Promise<string>((_resolve, reject) => {
			rejectFn = reject
		})

		dispose = render(
			() => (
				<Await
					error={(err) => <span data-testid="error">{err.message}</span>}
					pending={<span>Loading</span>}
					promise={promise}
				>
					{(data) => <span>{String(data)}</span>}
				</Await>
			),
			container,
		)

		rejectFn(new Error("fail"))
		await tick()

		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("fail")
	})

	it("error → renders error slot (deferred)", () => {
		const d = makeDeferred<string>({
			__error: { message: "fail" },
			promise: Promise.resolve(""),
		})

		dispose = render(
			() => (
				<Await
					error={(err) => <span data-testid="error">{err.message}</span>}
					pending={<span>Loading</span>}
					promise={d}
				>
					{(data) => <span>{String(data)}</span>}
				</Await>
			),
			container,
		)

		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("fail")
	})

	it("Deferred with __resolved → immediate render", () => {
		const d = makeDeferred<string>({
			__resolved: "instant",
			promise: Promise.resolve("instant"),
		})

		dispose = render(
			() => (
				<Await pending={<span>Loading</span>} promise={d}>
					{(data) => <span data-testid="data">{data}</span>}
				</Await>
			),
			container,
		)

		/* Synchronous — no tick needed */
		expect(container.querySelector("[data-testid='data']")?.textContent).toBe("instant")
	})

	it("Deferred with __error → immediate error render", () => {
		const d = makeDeferred<string>({
			__error: { message: "ssr error" },
			promise: Promise.reject(new Error("ssr error")),
		})
		/* Prevent unhandled rejection */
		d.promise.catch(() => {})

		dispose = render(
			() => (
				<Await
					error={(err) => <span data-testid="error">{err.message}</span>}
					pending={<span>Loading</span>}
					promise={d}
				>
					{(data) => <span>{String(data)}</span>}
				</Await>
			),
			container,
		)

		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("ssr error")
	})

	it("error slot receives reset function", () => {
		let resetFn: (() => void) | undefined

		/* Use Deferred with __error for synchronous error path (no unhandled rejection) */
		const d = makeDeferred<string>({
			__error: { message: "first" },
			promise: Promise.resolve(""),
		})

		dispose = render(
			() => (
				<Await
					error={(err, reset) => {
						resetFn = reset
						return <span data-testid="error">{err.message}</span>
					}}
					pending={<span data-testid="loading">Loading</span>}
					promise={d}
				>
					{(data) => <span data-testid="data">{data}</span>}
				</Await>
			),
			container,
		)

		expect(container.querySelector("[data-testid='error']")).not.toBeNull()
		expect(typeof resetFn).toBe("function")
	})

	it("race condition: stale promise ignored", async () => {
		let resolve1: (v: string) => void = () => {}
		const p1 = new Promise<string>((r) => {
			resolve1 = r
		})
		const p2 = Promise.resolve("second")

		const [promise, setPromise] = createSignal<Promise<string>>(p1)

		createRoot((rootDispose) => {
			dispose = render(
				() => (
					<Await pending={<span data-testid="loading">Loading</span>} promise={promise()}>
						{(data) => <span data-testid="data">{data}</span>}
					</Await>
				),
				container,
			)

			/* Switch to p2 before p1 resolves */
			setPromise(p2)

			tick().then(() => {
				/* p2 should win */
				expect(container.querySelector("[data-testid='data']")?.textContent).toBe("second")

				/* Late resolve of p1 should be ignored */
				resolve1("first")

				tick().then(() => {
					expect(container.querySelector("[data-testid='data']")?.textContent).toBe("second")
					rootDispose()
				})
			})
		})

		await tick()
		await tick()
	})

	it("no pending prop → renders nothing while loading", () => {
		const promise = new Promise<string>(() => {})

		dispose = render(
			() => <Await promise={promise}>{(data) => <span>{data}</span>}</Await>,
			container,
		)

		expect(container.innerHTML).toBe("")
	})

	it("no error prop + error → renders nothing", () => {
		/* Use Deferred with __error for synchronous error path (no unhandled rejection) */
		const d = makeDeferred<string>({
			__error: { message: "unhandled" },
			promise: Promise.resolve(""),
		})

		dispose = render(
			() => (
				<Await pending={<span>Loading</span>} promise={d}>
					{(data) => <span>{String(data)}</span>}
				</Await>
			),
			container,
		)

		expect(container.textContent).toBe("")
	})
})
