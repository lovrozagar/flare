import { afterEach, expect, it } from "vitest"
import { headTags, isOwned, ownedHtml } from "../../shared/head/index.ts"
import type { HeadConfig } from "../../shared/route-builder/types.ts"
import { applyOwned } from "./owned.ts"

afterEach(() => {
	document.head.innerHTML = ""
})

const owned = (head: HeadConfig, nonce?: string) => headTags(head, { nonce }).filter(isOwned)

const SERVED: HeadConfig = {
	custom: {
		links: [{ rel: "preconnect", href: "https://x.example" }],
		scripts: [{ src: "/count.js" }, { children: "window.__inl=(window.__inl||0)+1" }],
	},
}

// The served elements are adopted as they are: the same nodes, nothing inserted twice (BUGS.md 460).
it("adopt", () => {
	document.head.innerHTML = `<title>t</title>${ownedHtml(owned(SERVED))}`
	const before = [...document.head.children]
	applyOwned(owned(SERVED))
	expect([...document.head.children]).toEqual(before)
})

// A tag the merge no longer has is removed; one it gains is inserted in merge order; a script whose body changed is
// a new element, so it runs again; a link's other attributes change in place.
it("reconcile", () => {
	document.head.innerHTML = `<title>t</title>${ownedHtml(owned(SERVED))}`
	const link = document.head.querySelector("link")
	applyOwned(
		owned(
			{
				custom: {
					links: [{ rel: "preconnect", href: "https://x.example", crossorigin: "" }],
					scripts: [{ children: "window.__inl=2" }],
					styles: [{ children: "a{color:red}" }],
				},
			},
			"n1",
		),
	)
	const children = [...document.head.children]
	expect(children.map((element) => element.tagName.toLowerCase())).toEqual(["title", "link", "script", "style"])
	expect(children[1]).toBe(link)
	expect(link?.hasAttribute("crossorigin")).toBe(true)
	expect(children[2]?.textContent).toBe("window.__inl=2")
	expect(children[2]?.getAttribute("nonce")).toBe("n1")
	expect(children[3]?.getAttribute("nonce")).toBe("n1")
	expect(document.head.querySelector('script[src="/count.js"]')).toBeNull()
	applyOwned([])
	expect(document.head.querySelectorAll("[data-fh]")).toHaveLength(0)
	expect(document.head.querySelector("title")).not.toBeNull()
})

// Into an empty head, in merge order, each with its key; an external script without the request nonce.
it("insert", async () => {
	const tags = owned(SERVED, "n2")
	applyOwned(tags)
	// The inline script waits for the external one before it, as on a hard load.
	document.head.querySelector('script[src="/count.js"]')?.dispatchEvent(new Event("load"))
	await Promise.resolve()
	await Promise.resolve()
	const children = [...document.head.children]
	expect(children.map((element) => element.getAttribute("data-fh"))).toEqual(tags.map((tag) => tag.key))
	expect(children[1]?.getAttribute("src")).toBe("/count.js")
	expect(children[1]?.hasAttribute("nonce")).toBe(false)
	expect(children[2]?.getAttribute("nonce")).toBe("n2")
})

// A kept element's nonce is the browser's: it hides the attribute once the element is in the document, and setting it
// again would show it to CSS selectors. Only an element Flare creates gets the nonce.
it("kept nonce", () => {
	const tags = owned({ custom: { styles: [{ children: "a{}" }] } }, "n3")
	document.head.innerHTML = ownedHtml(tags).replace('nonce="n3"', 'nonce=""')
	applyOwned(tags)
	expect(document.head.querySelector("style")?.getAttribute("nonce")).toBe("")
})

// Two live elements with one key keep the first; the other is removed.
it("duplicate key", () => {
	const tags = owned({ custom: { links: [{ rel: "preconnect", href: "https://x.example" }] } })
	document.head.innerHTML = ownedHtml(tags) + ownedHtml(tags)
	applyOwned(tags)
	expect(document.head.querySelectorAll("link")).toHaveLength(1)
})

// A hard load runs an external script before the tags after it. An inserted external script keeps document order
// (`async` off), and the tags after it wait until it loads or fails; a newer merge drops what was waiting.
it("script order", async () => {
	const tags = owned({ custom: { scripts: [{ src: "/lib.js" }, { children: "void 0" }] } })
	applyOwned(tags)
	const lib = document.head.querySelector<HTMLScriptElement>('script[src="/lib.js"]')
	expect(lib?.async).toBe(false)
	expect(document.head.children).toHaveLength(1)
	lib?.dispatchEvent(new Event("load"))
	await Promise.resolve()
	await Promise.resolve()
	expect([...document.head.children].map((element) => element.textContent)).toEqual(["", "void 0"])
	document.head.innerHTML = ""
	applyOwned(tags)
	const waited = document.head.querySelector("script")
	applyOwned([])
	waited?.dispatchEvent(new Event("error"))
	await Promise.resolve()
	await Promise.resolve()
	expect(document.head.children).toHaveLength(0)
})

// A tag the merge gains ahead of every kept one goes before the first kept tag, not at the end, so merge order holds.
it("insert before kept", () => {
	const style = { children: "a{}" }
	document.head.innerHTML = `<title>t</title>${ownedHtml(owned({ custom: { styles: [style] } }))}`
	applyOwned(owned({ custom: { links: [{ rel: "preconnect", href: "https://x.example" }], styles: [style] } }))
	expect([...document.head.children].map((element) => element.tagName.toLowerCase())).toEqual([
		"title",
		"link",
		"style",
	])
})

// A kept external script that is still loading holds back the tags created after it, as an inserted one does, both as
// the first tag and after a newly inserted script.
it("kept script still loading", async () => {
	const lib = { src: "/lib.js" }
	applyOwned(owned({ custom: { scripts: [lib] } }))
	applyOwned(owned({ custom: { scripts: [lib, { children: "void 1" }] } }))
	await Promise.resolve()
	expect(document.head.querySelectorAll("script")).toHaveLength(1)
	applyOwned(owned({ custom: { scripts: [{ src: "/a.js" }, lib, { children: "void 2" }] } }))
	const [first, second] = document.head.querySelectorAll("script")
	expect([first?.getAttribute("src"), second?.getAttribute("src")]).toEqual(["/a.js", "/lib.js"])
	first?.dispatchEvent(new Event("load"))
	for (let tick = 0; tick < 4; tick += 1) await Promise.resolve()
	expect(document.head.querySelectorAll("script")).toHaveLength(2)
	second?.dispatchEvent(new Event("load"))
	for (let tick = 0; tick < 4; tick += 1) await Promise.resolve()
	expect([...document.head.querySelectorAll("script")].map((script) => script.textContent)).toEqual(["", "", "void 2"])
})

// A boolean attribute is written empty, and an `async` external script is not waited on; a kept link loses an
// attribute the merge no longer gives it.
it("attribute values", () => {
	const plain = { rel: "preconnect", href: "https://x.example" }
	document.head.innerHTML = ownedHtml(owned({ custom: { links: [{ ...plain, crossorigin: "" }] } }))
	applyOwned(owned({ custom: { links: [plain], scripts: [{ src: "/tag.js", async: true }, { children: "void 3" }] } }))
	expect(document.head.querySelector("link")?.hasAttribute("crossorigin")).toBe(false)
	const tag = document.head.querySelector<HTMLScriptElement>('script[src="/tag.js"]')
	expect(tag?.getAttribute("async")).toBe("")
	expect(document.head.querySelector("script:not([src])")?.textContent).toBe("void 3")
})
