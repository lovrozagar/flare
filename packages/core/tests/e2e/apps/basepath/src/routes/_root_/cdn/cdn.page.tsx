import { createPage } from "@lovrozagar/flare"

const RENDERS = Symbol.for("basepath.cdn.renders")

// One more render of this page in this server process.
function counted(): number {
	const next = Number(Reflect.get(globalThis, RENDERS) ?? 0) + 1
	Reflect.set(globalThis, RENDERS, next)
	return next
}

// A public CDN page with no store behind it, so each request renders and counts: minimal.test loads it twice by
// document navigation and must see the second render, whatever the browser's own cache does (BUGS.md 135).
export const route = createPage("_root_/cdn")
	.cache({ ssr: { ttl: "1h" }, cdn: { maxAge: "1h", swr: "1h" } })
	.loader(() => ({ render: counted() }))
	.render((props) => <p id="render">{props.loaderData.render}</p>)
