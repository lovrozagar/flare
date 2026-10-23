// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { trapFocus } from "./overlay-focus.ts"

afterEach(() => {
	document.body.replaceChildren()
})

function press(key: string, shiftKey = false): KeyboardEvent {
	const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })
	document.activeElement?.dispatchEvent(event)
	return event
}

function release(key: string): void {
	document.activeElement?.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }))
}

function overlay(html: string): HTMLElement {
	const root = document.createElement("div")
	root.innerHTML = html
	document.body.append(root)
	return root
}

// Focus moves into the overlay, Tab and Shift+Tab wrap inside it, Escape dismisses it, and the close gives focus back
// to the opener (B142).
it("trap", () => {
	document.body.innerHTML = '<a id="opener" href="/x">open</a>'
	document.getElementById("opener")?.focus()
	const root = overlay('<button id="one">1</button><p>text</p><input id="two"><button disabled>off</button>')
	const dismiss = vi.fn<() => void>()
	const close = trapFocus(() => [root], dismiss)
	expect(document.activeElement?.id).toBe("one")
	expect(press("Tab").defaultPrevented).toBe(false)
	document.getElementById("two")?.focus()
	expect(press("Tab").defaultPrevented).toBe(true)
	expect(document.activeElement?.id).toBe("one")
	press("Tab", true)
	expect(document.activeElement?.id).toBe("two")
	press("a")
	press("Escape")
	expect(dismiss).toHaveBeenCalledOnce()
	close()
	expect(document.activeElement?.id).toBe("opener")
	press("Escape")
	expect(dismiss).toHaveBeenCalledOnce()
})

// `autofocus` wins over document order; an overlay with nothing to focus takes focus itself and keeps Tab; a key the
// app already handled is left alone; an opener that left the page gets nothing back.
it("edges", () => {
	const marked = overlay('<button id="first">1</button><input id="query" autofocus>')
	const close = trapFocus(
		() => [marked],
		() => undefined,
	)
	expect(document.activeElement?.id).toBe("query")
	close()
	const plain = overlay("<p>only text</p>")
	const dismiss = vi.fn<() => void>()
	const shut = trapFocus(() => [plain], dismiss)
	expect(document.activeElement).toBe(plain)
	expect(plain.getAttribute("tabindex")).toBe("-1")
	expect(press("Tab").defaultPrevented).toBe(true)
	const handled = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
	handled.preventDefault()
	plain.dispatchEvent(handled)
	expect(dismiss).not.toHaveBeenCalled()
	marked.remove()
	shut()
	const empty = trapFocus(
		() => [],
		() => undefined,
	)
	expect(empty).toBeTypeOf("function")
	empty()
})

// Only what Tab reaches counts: a disabled Link (`tabindex="-1"`), a hidden or inert element, or a control in a
// disabled fieldset is skipped, so Tab and Shift+Tab wrap at the last and first reachable ones (BUGS.md 316).
it("unreachable skipped", () => {
	const root = overlay(
		'<button id="a">A</button><button id="b">B</button><a href="/x" tabindex="-1" aria-disabled="true">off</a>' +
			"<button hidden>h</button><div hidden><button>in hidden</button></div><div inert><button>in inert</button></div>" +
			'<fieldset disabled><input></fieldset><span tabindex="0" id="tail-hidden" hidden>t</span>',
	)
	const close = trapFocus(
		() => [root],
		() => undefined,
	)
	expect(document.activeElement?.id).toBe("a")
	document.getElementById("b")?.focus()
	expect(press("Tab").defaultPrevented).toBe(true)
	expect(document.activeElement?.id).toBe("a")
	expect(press("Tab", true).defaultPrevented).toBe(true)
	expect(document.activeElement?.id).toBe("b")
	close()
})

// macOS Safari's Tab skips links unless the user turned that on, so from a field in the middle of an overlay its own
// Tab can land on a control in the page behind, past the overlay's links, where Tab's wrap at the edges never runs
// (verify:safari, plan 35). Focus that lands outside the open overlay comes back: to its first element going forward,
// to its last after Shift+Tab. Closed, the overlay leaves focus alone (BUGS.md 501).
it("escaped focus", () => {
	document.body.innerHTML = '<button id="behind">behind</button>'
	const root = overlay('<input id="field"><a id="link" href="/r">result</a><button id="last">close</button>')
	const close = trapFocus(
		() => [root],
		() => undefined,
	)
	document.getElementById("field")?.focus()
	press("Tab")
	document.getElementById("behind")?.focus()
	expect(document.activeElement?.id).toBe("field")
	document.getElementById("link")?.focus()
	press("Tab", true)
	document.getElementById("behind")?.focus()
	expect(document.activeElement?.id).toBe("last")
	close()
	document.getElementById("behind")?.focus()
	expect(document.activeElement?.id).toBe("behind")
	// An overlay with nothing to focus takes the focus back itself.
	const bare = overlay('<p id="note">nothing to focus</p>')
	const closeBare = trapFocus(
		() => [bare],
		() => undefined,
	)
	press("Tab")
	document.getElementById("behind")?.focus()
	expect(document.activeElement).toBe(bare)
	closeBare()
})

// Closing takes the guard down before focus goes back to the opener, so the return is not pulled into the overlay
// that is closing (BUGS.md 501).
it("close returns past the guard", () => {
	document.body.innerHTML = '<a id="opener" href="/x">open</a>'
	document.getElementById("opener")?.focus()
	const root = overlay('<button id="one">1</button>')
	const close = trapFocus(
		() => [root],
		() => undefined,
	)
	expect(document.activeElement?.id).toBe("one")
	close()
	expect(document.activeElement?.id).toBe("opener")
})

// Focus a click or the app moves out with no Tab, into a popup the overlay mounted through a Portal say, stays where
// it went. A Tab from the popup is a Tab from outside: it goes to the overlay's first element (BUGS.md 501.3).
it("focus moved by the app", () => {
	document.body.innerHTML = '<input id="popup">'
	const root = overlay('<button id="one">1</button><button id="two">2</button>')
	const close = trapFocus(
		() => [root],
		() => undefined,
	)
	document.getElementById("two")?.focus()
	document.getElementById("popup")?.focus()
	expect(document.activeElement?.id).toBe("popup")
	expect(press("Tab").defaultPrevented).toBe(true)
	expect(document.activeElement?.id).toBe("one")
	close()
})

// A Tab that moved no focus, as one the browser kept in a field, ends with its key's release: a click that follows
// stays where it went. Another key's release leaves a pending Tab alone (BUGS.md 501.3).
it("tab without a move", () => {
	document.body.innerHTML = '<button id="behind">behind</button>'
	const root = overlay('<button id="one">1</button><button id="two">2</button>')
	const close = trapFocus(
		() => [root],
		() => undefined,
	)
	press("Tab")
	release("Tab")
	document.getElementById("behind")?.focus()
	expect(document.activeElement?.id).toBe("behind")
	document.getElementById("two")?.focus()
	press("Tab", true)
	release("Shift")
	document.getElementById("behind")?.focus()
	expect(document.activeElement?.id).toBe("two")
	close()
})

// A Shift+Tab sets the direction for the focus change that follows it only: a later Tab that leaves goes to the first
// element, not the last, and a move after that with no Tab stays where it went (BUGS.md 501, 501.3).
it("direction resets", () => {
	document.body.innerHTML = '<button id="behind">behind</button>'
	const root = overlay('<button id="one">1</button><button id="two">2</button>')
	const close = trapFocus(
		() => [root],
		() => undefined,
	)
	document.getElementById("two")?.focus()
	press("Tab", true)
	document.getElementById("one")?.focus()
	press("Tab")
	document.getElementById("behind")?.focus()
	expect(document.activeElement?.id).toBe("one")
	document.getElementById("behind")?.focus()
	expect(document.activeElement?.id).toBe("behind")
	close()
})
