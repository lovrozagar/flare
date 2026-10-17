const FOCUSABLE = [
	"a[href]",
	"area[href]",
	"button:not(:disabled)",
	'input:not(:disabled):not([type="hidden"])',
	"select:not(:disabled)",
	"textarea:not(:disabled)",
	"iframe",
	'[contenteditable="true"]',
	'[tabindex]:not([tabindex="-1"])',
].join(", ")

// While an overlay is open, keyboard focus stays in it (plan 21 4.1, B142). `roots` reads the overlay's top elements as
// they are now, so content that changes while it is open is trapped too. Focus moves in as it opens, to the element
// marked `autofocus`, else the first that takes focus, else the overlay's first element, without scrolling the page
// under it. Tab and Shift+Tab wrap inside it, Escape dismisses it unless the app already handled the key, and the
// returned close gives focus back to the element that had it before, the link that opened the overlay.
export function trapFocus(roots: () => readonly Element[], dismiss: () => void, doc: Document = document): () => void {
	const opener = doc.activeElement
	const focusables = (): HTMLElement[] =>
		roots()
			.flatMap((root) => [root, ...root.querySelectorAll(FOCUSABLE)])
			.filter(focusable)
	const marked = roots()
		.map((root) => root.querySelector<HTMLElement>("[autofocus]"))
		.find((node) => node !== null)
	focusOn(marked ?? focusables()[0] ?? roots()[0])
	const onKey = (event: KeyboardEvent): void => {
		if (event.defaultPrevented || event.isComposing) return
		if (event.key === "Escape") return void dismiss()
		if (event.key === "Tab") wrap(event, focusables(), doc.activeElement)
	}
	doc.addEventListener("keydown", onKey)
	return () => {
		doc.removeEventListener("keydown", onKey)
		if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
	}
}

// What Tab reaches: not a `tabindex="-1"` element, such as a disabled Link, nothing hidden or inert, and nothing the
// browser does not render; a control in a disabled fieldset is `:disabled` (BUGS.md 316).
function focusable(node: Element): node is HTMLElement {
	if (!(node instanceof HTMLElement) || !node.matches(FOCUSABLE) || node.tabIndex < 0) return false
	return node.closest("[hidden], [inert]") === null && node.checkVisibility?.() !== false
}

// Past the last element Tab goes to the first, before the first Shift+Tab to the last, and from outside to the first.
function wrap(event: KeyboardEvent, list: readonly HTMLElement[], active: Element | null): void {
	const at = list.findIndex((node) => node === active)
	const edge = event.shiftKey ? at <= 0 : at === -1 || at === list.length - 1
	if (!edge) return
	event.preventDefault()
	list.at(event.shiftKey ? -1 : 0)?.focus()
}

function focusOn(target: Element | undefined): void {
	if (!(target instanceof HTMLElement)) return
	if (!target.matches(FOCUSABLE) && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1")
	target.focus({ preventScroll: true })
}
