import { expect, it, vi } from "vitest"
import type { NavigatorDeps } from "./navigate.ts"
import { keepPosition, land, scrollFor } from "./steps.ts"

const place = { pathname: "/a", search: "", hash: "#top" }

// The history and scroll surface the steps touch, recorded.
function deps() {
	type Write = (url: string, state: unknown) => void
	type Keep = (index: number, place: unknown) => void
	const history = { index: () => 3, push: vi.fn<Write>(), replace: vi.fn<Write>() }
	const scroll = { save: vi.fn<Keep>(), restore: vi.fn<Keep>(), afterCommit: vi.fn<(at: unknown) => void>() }
	return { history, scroll, deps: { history, scroll } as unknown as NavigatorDeps }
}

// The page being left keeps its position on a step that writes history, not on a pop or an in-place commit.
it("keep position", () => {
	const { scroll, deps: d } = deps()
	keepPosition(d, place, { options: { to: "/b" }, pop: false, write: true })
	keepPosition(d, place, { options: { to: "/b" }, pop: true, write: true })
	keepPosition(d, place, { options: { to: "/b" }, pop: false, write: false })
	expect(scroll.save.mock.calls).toEqual([[3, place]])
})

// A step forward pushes, or replaces with `replace`, then scrolls to the hash; one already scrolled does not again.
it("land", () => {
	const { history, scroll, deps: d } = deps()
	land(d, { url: "/b", location: place }, { options: { to: "/b", state: 1 }, pop: false, write: true })
	land(d, { url: "/c", location: place }, { options: { to: "/c", replace: true }, pop: false, write: true })
	land(d, { url: "/d", location: place }, { options: { to: "/d" }, pop: false, write: false, scrolled: true })
	expect(history.push.mock.calls).toEqual([["/b", 1]])
	expect(history.replace.mock.calls).toEqual([["/c", undefined]])
	expect(scroll.afterCommit.mock.calls).toEqual([[{ hash: "#top", scroll: true }], [{ hash: "#top", scroll: true }]])
})

// A pop restores its saved position; `scroll: false` keeps the page where it is.
it("scroll for", () => {
	const { scroll, deps: d } = deps()
	scrollFor(d, place, { options: { to: "/a" }, pop: true, write: false })
	scrollFor(d, place, { options: { to: "/a", scroll: false }, pop: false, write: true })
	expect(scroll.restore.mock.calls).toEqual([[3, place]])
	expect(scroll.afterCommit.mock.calls).toEqual([[{ hash: "#top", scroll: false }]])
})
