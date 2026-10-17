import { afterEach, expect, it, vi } from "vitest"
import { createArrival } from "./arrival.ts"

const at = (pathname: string, hash = "") => ({ pathname, search: "", hash })

afterEach(() => {
	document.body.replaceChildren()
	document.title = ""
})

function page(html: string, title: string): void {
	document.body.innerHTML = html
	document.title = title
}

// A navigation that lands on a new page moves focus to its main heading, without scrolling, and announces its title
// in one polite live region the second visit reuses (plan 21 4.1, B141).
it("heading and title", () => {
	const arrive = createArrival(document)
	page("<header><h1>Site</h1></header><main><p>x</p><h1>Routing</h1></main>", "Routing | Docs")
	const heading = document.querySelectorAll("h1")[1]
	const focus = vi.spyOn(heading as HTMLElement, "focus")
	arrive(at("/docs/routing"))
	expect(document.activeElement).toBe(heading)
	expect(focus).toHaveBeenCalledWith({ preventScroll: true })
	const region = document.getElementById("flare-announcer")
	expect(region?.getAttribute("aria-live")).toBe("polite")
	expect(region?.getAttribute("aria-atomic")).toBe("true")
	expect(region?.textContent).toBe("Routing | Docs")
	expect(region?.style.position).toBe("absolute")
	// The heading takes focus only for this visit: the tabindex it needed goes once focus leaves.
	expect(heading?.getAttribute("tabindex")).toBe("-1")
	heading?.blur()
	expect(heading?.hasAttribute("tabindex")).toBe(false)
	page("<main><h1>Caching</h1></main>", "Caching | Docs")
	document.body.append(region as HTMLElement)
	arrive(at("/docs/caching"))
	expect(document.querySelectorAll("#flare-announcer")).toHaveLength(1)
	expect(region?.textContent).toBe("Caching | Docs")
})

// A hash names the element that takes focus. Without a heading, `main` does, then the body; without a title, the
// heading's text is announced, then the pathname. An element that already takes focus keeps its own tabindex.
it("fallbacks", () => {
	const arrive = createArrival(document)
	page('<main><h1>Top</h1><a id="install" href="/x">Install</a></main>', "")
	arrive(at("/docs", "#install"))
	expect(document.activeElement?.id).toBe("install")
	expect(document.getElementById("install")?.hasAttribute("tabindex")).toBe(false)
	expect(document.getElementById("flare-announcer")?.textContent).toBe("Top")
	// A hash that is not a valid escape is read as written.
	page('<main><h1>Top</h1><p id="%E0">odd</p></main>', "")
	arrive(at("/odd", "#%E0"))
	expect(document.activeElement?.id).toBe("%E0")
	page("<main><p>no heading</p></main>", "")
	arrive(at("/plain", "#missing"))
	expect(document.activeElement?.tagName).toBe("MAIN")
	expect(document.getElementById("flare-announcer")?.textContent).toBe("/plain")
	page("<div><h1>Loose</h1></div>", "Loose")
	arrive(at("/loose"))
	expect(document.activeElement?.textContent).toBe("Loose")
	page("<p>nothing</p>", "")
	arrive(at("/bare"))
	expect(document.activeElement).toBe(document.body)
})
