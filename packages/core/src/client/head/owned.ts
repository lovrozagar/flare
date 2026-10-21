import { OWNED_KEY, type HeadTag } from "../../shared/head/index.ts"

// Flare's own head tags on the client (BUGS.md 460): the merge's links, scripts, and styles, keyed by `data-fh` as
// the server wrote them. An element whose key the merge still has is kept, the server's copy at hydration among
// them, so a served script never runs twice; a second element with the same key is removed. A tag the merge lacks is
// removed, and one it gains is inserted after the tag before it in merge order. A key names a script's `src` or body,
// so a changed one is a new element and runs; removing a script does not undo what it ran. A kept link or style takes
// the merge's attributes in place, its nonce aside: the browser hid that once the element was in the document.
//
// A hard load runs an external script before the tags after it. An inserted external script keeps document order, and
// every tag created after one that is still loading waits until it loads or fails. A newer merge drops what an older
// one left waiting, since it applies its own tags.
export function applyOwned(tags: readonly HeadTag[], head: HTMLHeadElement = document.head): void {
	const run = (runs.get(head) ?? 0) + 1
	runs.set(head, run)
	const present = presentByKey(head)
	const wanted = new Set(tags.map((tag) => tag.key))
	for (const [key, element] of present) if (!wanted.has(key)) element.remove()
	let gate: Promise<void> | undefined
	let previous: Element | undefined
	for (const tag of tags) {
		const kept = present.get(tag.key)
		if (kept !== undefined && tag.tag !== "script") attributes(kept, tag, false)
		const element = kept ?? created(tag)
		if (kept === undefined) {
			const place = placer(
				element,
				{ anchor: previous ?? firstKept(tags, present), first: previous === undefined },
				head,
			)
			gate = gate === undefined ? place() : gate.then(() => (runs.get(head) === run ? place() : undefined))
		} else if (loading.has(kept)) gate = (gate ?? Promise.resolve()).then(() => loading.get(kept))
		previous = element
	}
}

// Each head's latest run, so a run's waiting tags go in only while it is the latest.
const runs = new WeakMap<HTMLHeadElement, number>()

// An inserted external script's load, until it loads or fails.
const loading = new WeakMap<Element, Promise<void>>()

// The live owned elements by key. A second element with a key already seen is removed.
function presentByKey(head: HTMLHeadElement): Map<string, Element> {
	const present = new Map<string, Element>()
	for (const element of head.querySelectorAll(`[${OWNED_KEY}]`)) {
		// The selector matched the attribute, so it is there.
		const key = element.getAttribute(OWNED_KEY) as string
		if (present.has(key)) element.remove()
		else present.set(key, element)
	}
	return present
}

// Inserts the element after the tag before it, or the first one before the first kept tag, or at the end of an empty
// set. An external script that is not `async` gives back its load, which the next tags wait on.
function placer(element: Element, at: { anchor: Element | undefined; first: boolean }, head: HTMLHeadElement) {
	const { anchor, first } = at
	return (): Promise<void> | undefined => {
		if (anchor === undefined) head.append(element)
		else if (first) anchor.before(element)
		else anchor.after(element)
		return loading.get(element)
	}
}

function firstKept(tags: readonly HeadTag[], present: ReadonlyMap<string, Element>): Element | undefined {
	for (const tag of tags) {
		const element = present.get(tag.key)
		if (element !== undefined) return element
	}
	return undefined
}

// A new element: its attributes, nonce included, then its text, before it is on the page, so a script runs with them.
// An external script runs in insertion order unless the merge asked for `async`.
function created(tag: HeadTag): Element {
	const element = document.createElement(tag.tag)
	attributes(element, tag, true)
	const text = tag.props["children"]
	if (typeof text === "string") element.textContent = text
	if (element instanceof HTMLScriptElement && tag.props["src"] !== undefined && tag.props["async"] !== true) {
		element.async = false
		loading.set(element, settled(element))
	}
	return element
}

function settled(script: HTMLScriptElement): Promise<void> {
	return new Promise((resolve) => {
		const done = (): void => {
			loading.delete(script)
			resolve()
		}
		script.addEventListener("load", done, { once: true })
		script.addEventListener("error", done, { once: true })
	})
}

function attributes(element: Element, tag: HeadTag, withNonce: boolean): void {
	const names = new Set<string>([OWNED_KEY, "nonce"])
	for (const [name, value] of Object.entries(tag.props)) {
		if (name === "children" || value === false || (name === "nonce" && !withNonce)) continue
		names.add(name)
		element.setAttribute(name, value === true ? "" : value)
	}
	element.setAttribute(OWNED_KEY, tag.key)
	for (const name of element.getAttributeNames()) if (!names.has(name)) element.removeAttribute(name)
}
