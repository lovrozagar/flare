// v0's match-id.bench.ts bench, ported (plan 21 15.6): routing a path to its match, over a tree of fifty routes. Nightly only: a bench's number is compared to the previous
// night's on the same runner class, not budgeted (tests/perf/BASELINE.md).
import { bench, describe } from "vitest"
import { createPage } from "../src/shared/route-builder/page.ts"
import { createRootLayout } from "../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../src/shared/router/create-router.ts"

const root = createRootLayout("_root_").render((props) => props.children)
const page = (id: string, path: string) => ({ id, path, module: createPage(id).render(() => id) })
const routeTree = [
	page("_root_/", "/"),
	...Array.from({ length: 45 }, (_, index) => page(`_root_/section-${index}`, `/section-${index}`)),
	page("_root_/posts/[slug]", "/posts/[slug]"),
	page("_root_/docs/[...path]", "/docs/[...path]"),
	page("_root_/files/[[...rest]]", "/files/[[...rest]]"),
	page("_root_/users/[id]/posts/[post]", "/users/[id]/posts/[post]"),
]
const router = createRouter({ layouts: { _root_: root }, routeTree })

// The router keeps each matched path, so a repeated path is the kept match: the fresh cases name a new path each call,
// which is the routing itself. A static path has no fresh form: the tree's 45 are kept after their first match.
let count = 0

describe("router.match", () => {
	bench("a kept path", () => void router.match("/posts/building-web-frameworks"))
	bench("one param, fresh", () => void router.match(`/posts/post-${(count += 1)}`))
	bench("two params, fresh", () => void router.match(`/users/${(count += 1)}/posts/12`))
	bench("catch-all, fresh", () => void router.match(`/docs/server/${(count += 1)}/options`))
	bench("no route, fresh", () => void router.match(`/nowhere/${(count += 1)}/at/all`))
})
