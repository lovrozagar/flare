import { expect, it } from "vitest"
import { LOCALE_COOKIE, localeCookie } from "./cookie.ts"

// The attributes the server and setLocale share, so the two writers cannot diverge.
it("cookie string", () => {
	expect(localeCookie(LOCALE_COOKIE, "hr", false)).toBe("flare.locale=hr; Path=/; SameSite=Lax; Max-Age=31536000")
	expect(localeCookie("lang", "en-US", true)).toBe("lang=en-US; Path=/; SameSite=Lax; Max-Age=31536000; Secure")
	expect(localeCookie(LOCALE_COOKIE, "hr", true)).not.toMatch(/Domain/i)
})
