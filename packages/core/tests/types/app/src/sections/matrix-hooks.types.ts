// dx/types.md "Matrix", the hook, i18n, and defer rows (cases 59 to 67), read through the package entries from the
// register codegen wrote for this app. app.test.ts compiles this file; vitest never runs it (B96, plan 25 5.2).
import {
	type Deferred,
	navigate,
	useLoaderData,
	useLocation,
	useMatch,
	useNavigate,
	useParams,
	usePreloaderContext,
	useSearch,
} from "@lovrozagar/flare"
import { createTranslations, useLoaderT, usePreloaderT } from "@lovrozagar/flare/i18n"
import { expectTypeOf, it } from "vitest"

it("hook from", () => {
	expectTypeOf(useLoaderData({ from: "_root_/about" })).toEqualTypeOf<{ title: string }>()
	expectTypeOf(useParams({ from: "_root_/users/[id]" })).toEqualTypeOf<{ id: string }>()
	expectTypeOf(useSearch({ from: "_root_/search" })).toEqualTypeOf<{ q: string; page?: number }>()
	void usePreloaderContext({ from: "_root_/about" })
	void useMatch({ from: "_root_/about" })
	// @ts-expect-error from is required
	void useLoaderData()
	// @ts-expect-error from is required
	void useParams()
	// @ts-expect-error from is required
	void useSearch()
	// @ts-expect-error from is required
	void usePreloaderContext()
	// @ts-expect-error from is required
	void useMatch()
})

it("hook unknown", () => {
	// @ts-expect-error an unknown id is rejected by useLoaderData
	void useLoaderData({ from: "nope" })
	// @ts-expect-error an unknown id is rejected by useParams
	void useParams({ from: "nope" })
	// @ts-expect-error an unknown id is rejected by useSearch
	void useSearch({ from: "nope" })
	// @ts-expect-error an unknown id is rejected by usePreloaderContext
	void usePreloaderContext({ from: "nope" })
	// @ts-expect-error an unknown id is rejected by useMatch
	void useMatch({ from: "nope" })
})

it("use match untyped", () => {
	expectTypeOf(useMatch({ from: "_root_/users/[id]" })).toEqualTypeOf<{
		readonly id: string
		readonly routeId: string
	}>()
	// @ts-expect-error the match has no typed params
	void useMatch({ from: "_root_/users/[id]" }).params
	// @ts-expect-error the match has no loader data
	void useMatch({ from: "_root_/users/[id]" }).loaderData.user
})

it("use location raw", () => {
	expectTypeOf(useLocation().search).toEqualTypeOf<Record<string, string | string[]>>()
	expectTypeOf(useLocation().params).toEqualTypeOf<Record<string, string | string[]>>()
	// @ts-expect-error the location search is raw, not the validator output
	const _typed: { q: string; page?: number } = useLocation().search
})

it("use navigate", () => {
	const bound = useNavigate()
	expectTypeOf(bound).toEqualTypeOf<typeof navigate>()
	// @ts-expect-error the bound navigate takes an object, so it is not a (to: string) function
	const untyped: (to: string) => void = bound
	void untyped
})

it("i18n t hooks", () => {
	const messages = createTranslations({ en: { terms: "Read the terms" } })
	expectTypeOf(useLoaderT(messages)("terms")).toEqualTypeOf<string>()
	expectTypeOf(usePreloaderT(messages)("terms")).toEqualTypeOf<string>()
	// @ts-expect-error a loader's t takes translations, not a from argument
	void useLoaderT({ from: "_root_/about" })
	// @ts-expect-error a loader's t needs translations
	void useLoaderT()
	// @ts-expect-error a preloader's t takes translations, not a from argument
	void usePreloaderT({ from: "_root_/about" })
	// @ts-expect-error a preloader's t needs translations
	void usePreloaderT()
})

it("defer field", () => {
	const reviews = useLoaderData({ from: "_root_/reviews" }).reviews
	expectTypeOf(reviews.key).toEqualTypeOf<string>()
	expectTypeOf(reviews.promise).toEqualTypeOf<Promise<{ quote: string }>>()
	// @ts-expect-error the field is the Deferred, not its value
	const _value: { quote: string } = reviews
	async function awaited(): Promise<void> {
		// @ts-expect-error a Deferred has no then, so awaiting it is not the value
		const _quote: { quote: string } = await reviews
	}
	void awaited
})

it("defer nested", () => {
	const reviews = useLoaderData({ from: "_root_/reviews" }).reviews
	async function read(): Promise<void> {
		expectTypeOf((await reviews.promise).quote).toEqualTypeOf<string>()
	}
	void read
	// @ts-expect-error the value is on .promise
	void reviews.quote
	// @ts-expect-error the deferred has no message
	void reviews.message
})

it("defer no then", () => {
	const reviews = useLoaderData({ from: "_root_/reviews" }).reviews
	expectTypeOf<Awaited<typeof reviews>>().toEqualTypeOf<typeof reviews>()
	// @ts-expect-error Awaited of the Deferred is the Deferred, not its value
	expectTypeOf<Awaited<typeof reviews>>().toEqualTypeOf<{ quote: string }>()
})

// A child component's prop, typed with the exported Deferred.
function child(read: () => Deferred<{ quote: string }>): void {
	void read
}

// A Deferred of another value does not pass for it.
function other(read: () => Deferred<string>): void {
	// @ts-expect-error a Deferred of another value is not this one
	child(read)
}

it("deferred named", () => {
	const reviews = useLoaderData({ from: "_root_/reviews" }).reviews
	expectTypeOf(reviews).toEqualTypeOf<Deferred<{ quote: string }>>()
	child(() => useLoaderData({ from: "_root_/reviews" }).reviews)
	void other
})
