import { expect, it } from "vitest"
import { boot, type Boot } from "./boot.ts"
import { WEBKIT_NO_COOP, webkitCoopEnv } from "./e2e-env.ts"

// A real vite dev server boots in a child process, as trace.test's cases do.
const VITE_BOOT = 30_000

const SAFARI =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Safari/605.1.15"
const CHROME =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36"

// A minimal dev boot with FLARE_E2E_WEBKIT_NO_COOP as `value` gives, then the env as it was.
async function bootWith(value: string | undefined): Promise<Boot> {
	const before = process.env[WEBKIT_NO_COOP]
	if (value === undefined) delete process.env[WEBKIT_NO_COOP]
	else process.env[WEBKIT_NO_COOP] = value
	try {
		return await boot({ app: "minimal", runtime: "node", mode: "dev" })
	} finally {
		if (before === undefined) delete process.env[WEBKIT_NO_COOP]
		else process.env[WEBKIT_NO_COOP] = before
	}
}

async function coopFor(session: Boot, agent: string): Promise<string | null> {
	const response = await fetch(`${session.origin}/`, { headers: { "user-agent": agent, accept: "text/html" } })
	await response.text()
	return response.headers.get("cross-origin-opener-policy")
}

// Without the switch, as verify:safari boots its apps, real Safari gets flare's default COOP; the switch, which only
// Playwright's runs set, drops it for a WebKit agent alone (BUGS.md 504.12).
it(
	"webkit coop switch",
	async () => {
		expect([webkitCoopEnv({}), webkitCoopEnv({ [WEBKIT_NO_COOP]: "0" })]).toEqual([{}, {}])
		expect(webkitCoopEnv({ [WEBKIT_NO_COOP]: "1" })).toEqual({ [WEBKIT_NO_COOP]: "1" })
		const plain = await bootWith(undefined)
		try {
			expect([await coopFor(plain, SAFARI), await coopFor(plain, CHROME)]).toEqual(["same-origin", "same-origin"])
		} finally {
			await plain.close()
		}
		const switched = await bootWith("1")
		try {
			expect([await coopFor(switched, SAFARI), await coopFor(switched, CHROME)]).toEqual([null, "same-origin"])
		} finally {
			await switched.close()
		}
	},
	VITE_BOOT * 2,
)
