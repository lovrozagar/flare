import { describe, expect, it } from "vitest"
import { withWebKitCoop } from "./webkit-coop.ts"

const SAFARI =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15"
const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36"
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0"

const request = (agent: string) => ({ request: new Request("http://h/", { headers: { "user-agent": agent } }) })

// The harness serves every engine from one server per app, so its security drops COOP for a WebKit agent alone, over
// the case's own security, an object or a callback (BUGS.md 504.12).
describe("webkit coop", () => {
	it("harness security", () => {
		const own = withWebKitCoop({ security: { "X-Frame-Options": "SAMEORIGIN" } })
		expect(own(request(SAFARI))).toEqual({ "X-Frame-Options": "SAMEORIGIN", "Cross-Origin-Opener-Policy": false })
		expect([own(request(CHROME)), own(request(FIREFOX))]).toEqual([
			{ "X-Frame-Options": "SAMEORIGIN" },
			{ "X-Frame-Options": "SAMEORIGIN" },
		])
		const called = withWebKitCoop({ security: () => ({ "Cross-Origin-Opener-Policy": "same-origin-allow-popups" }) })
		expect(called(request(SAFARI))).toEqual({ "Cross-Origin-Opener-Policy": false })
		expect(called(request(CHROME))).toEqual({ "Cross-Origin-Opener-Policy": "same-origin-allow-popups" })
		expect(withWebKitCoop(undefined)(request(CHROME))).toEqual({})
	})
})
