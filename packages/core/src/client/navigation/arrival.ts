import type { Location } from "../../shared/url/index.ts"

const ANNOUNCER = "flare-announcer"

// What a client navigation that lands on a new page does for a keyboard or screen reader user, as a document load
// would (plan 21 4.1, B141): focus moves to the element the hash names, else the page's main heading, else `main`,
// else the body, without scrolling, since the step already scrolled; and the new title is read out by one polite live
// region, the main heading's text or the pathname when the page has no title: the heading read is the one focus goes
// to (BUGS.md 319).
export function createArrival(doc: Document): (location: Location) => void {
	return (location) => {
		focusOn(targetOf(doc, location))
		announce(doc, doc.title || (headingOf(doc)?.textContent ?? "") || location.pathname)
	}
}

function headingOf(doc: Document): HTMLElement | null {
	return doc.querySelector<HTMLElement>("main h1") ?? doc.querySelector<HTMLElement>("h1")
}

function targetOf(doc: Document, location: Location): HTMLElement {
	const id = decoded(location.hash.slice(1))
	const named = id === "" ? null : doc.getElementById(id)
	return named ?? headingOf(doc) ?? doc.querySelector<HTMLElement>("main") ?? doc.body
}

function decoded(id: string): string {
	try {
		return decodeURIComponent(id)
	} catch {
		return id
	}
}

// An element that does not take focus gets `tabindex="-1"` for this visit only: it goes once focus leaves.
function focusOn(target: HTMLElement): void {
	if (target.tabIndex < 0 && !target.hasAttribute("tabindex") && target !== target.ownerDocument.body) {
		target.setAttribute("tabindex", "-1")
		target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true })
	}
	target.focus({ preventScroll: true })
}

// One region per document, made on the first announcement, hidden from sight but not from assistive technology.
function announce(doc: Document, text: string): void {
	const region = doc.getElementById(ANNOUNCER) ?? doc.body.appendChild(regionOf(doc))
	region.textContent = text
}

function regionOf(doc: Document): HTMLElement {
	const region = doc.createElement("div")
	region.id = ANNOUNCER
	region.setAttribute("aria-live", "polite")
	region.setAttribute("aria-atomic", "true")
	// Set through the style object, which a nonce CSP allows, where a `style` attribute would need 'unsafe-inline'.
	Object.assign(region.style, {
		position: "absolute",
		width: "1px",
		height: "1px",
		margin: "-1px",
		padding: "0",
		overflow: "hidden",
		clip: "rect(0 0 0 0)",
		whiteSpace: "nowrap",
		border: "0",
	})
	return region
}
