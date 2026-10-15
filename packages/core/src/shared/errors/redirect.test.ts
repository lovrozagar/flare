import { expect, it } from "vitest"
import { RedirectError, redirect } from "./redirect.ts"

function thrown(target: Parameters<typeof redirect>[0]): RedirectError {
	try {
		redirect(target)
	} catch (error) {
		return error as RedirectError
	}
	throw new Error("returned")
}

it("route", () => {
	const error = thrown({ to: "_root_/about" })
	expect(error).toBeInstanceOf(RedirectError)
	expect(error.status).toBe(307)
	expect(error.defaulted).toBe(true)
	expect(error.replace).toBe(true)
	expect(error.to).toBe("_root_/about")
})

it("status", () => {
	expect(thrown({ to: "_root_", status: 301 }).status).toBe(301)
	expect(thrown({ to: "_root_", status: 301 }).defaulted).toBe(false)
	// @ts-expect-error a redirect status is one of the five; the runtime check stays for an untyped caller
	expect(() => redirect({ to: "_root_", status: 200 })).toThrow("200")
})

it("replace", () => {
	expect(thrown({ to: "_root_", replace: false }).replace).toBe(false)
})

it("href", () => {
	expect(thrown({ href: "https://ex.com/a" }).href).toBe("https://ex.com/a")
	expect(thrown({ href: "http://ex.com/a" }).href).toBe("http://ex.com/a")
	expect(() => redirect({ href: "javascript:alert(1)" })).toThrow("href")
	// @ts-expect-error an href goes alone
	expect(() => redirect({ href: "https://ex.com", to: "_root_" })).toThrow("href")
	// @ts-expect-error an href takes no params
	expect(() => redirect({ href: "https://ex.com", params: { id: "1" } })).toThrow("href")
	// @ts-expect-error an href takes no search
	expect(() => redirect({ href: "https://ex.com", search: { q: "1" } })).toThrow("href")
	// @ts-expect-error a target needs `to` or `href`
	expect(() => redirect({})).toThrow("to")
})
