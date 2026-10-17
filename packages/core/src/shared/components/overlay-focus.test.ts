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
