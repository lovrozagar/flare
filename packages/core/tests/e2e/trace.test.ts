import { expect, it } from "vitest"
import { boot, type Boot } from "./boot.ts"
import { traceEnv } from "./e2e-env.ts"

// A real vite dev server boots in a child process, as boot.test's cases do.
const VITE_BOOT = 30_000

const DOCUMENT = { accept: "text/html", "sec-fetch-dest": "document" }

// A dev boot under FLARE_E2E_TRACE as `value` gives, then the env as it was.
async function bootWith(value: string | undefined, runtime: string): Promise<Boot> {
	const before = process.env["FLARE_E2E_TRACE"]
	if (value === undefined) delete process.env["FLARE_E2E_TRACE"]
	else process.env["FLARE_E2E_TRACE"] = value
	try {
		return await boot({ app: "minimal", runtime, mode: "dev" })
	} finally {
		if (before === undefined) delete process.env["FLARE_E2E_TRACE"]
		else process.env["FLARE_E2E_TRACE"] = before
	}
}

// Unset, or anything but 1, the boot names no trace and the server logs no request: every run but CI's e2e jobs
// (BUGS.md 453).
it(
	"trace off",
	async () => {
		expect(traceEnv({})).toEqual({})
		expect(traceEnv({ FLARE_E2E_TRACE: "0" })).toEqual({})
		const session = await bootWith(undefined, "node")
		try {
			await (await fetch(`${session.origin}/`, { headers: DOCUMENT })).text()
			await (await fetch(`${session.origin}/@vite/client`)).text()
			expect(session.logs().filter((line) => line.includes("[trace]"))).toEqual([])
		} finally {
			await session.close()
		}
	},
	VITE_BOOT,
)

// FLARE_E2E_TRACE=1 names trace.ts by URL. A document's lifecycle is logged from its arrival to its close, and a module
// Vite serves is logged too: the trace's middleware runs ahead of Vite's own. /skeletons streams for over a second, so
// its head and first bytes go out between polls, well before it finishes.
it.each(["node", "bun"])(
	"trace on %s",
	async (runtime) => {
		expect(traceEnv({ FLARE_E2E_TRACE: "1" })).toEqual({
			FLARE_E2E_TRACE_PLUGIN: new URL("./trace.ts", import.meta.url).href,
		})
		const session = await bootWith("1", runtime)
		try {
			await (await fetch(`${session.origin}/skeletons`, { headers: DOCUMENT })).text()
			await (await fetch(`${session.origin}/@vite/client`)).text()
			const traced = (): string[] =>
				session
					.logs()
					.filter((line) => line.startsWith("[trace]"))
					.map((line) => line.replace(/^\[trace\] \d+ #\d+ /, ""))
			const closed = (): number => traced().filter((line) => line.includes(" close ")).length
			await expect.poll(closed).toBe(2)
			const page = traced()
				.filter((line) => line.startsWith("GET /skeletons "))
				.map((line) => line.replace(/(?<=finish 200 |bytes=)\d+$/, "N"))
			expect(page).toEqual([
				"GET /skeletons arrived",
				"GET /skeletons head 200",
				"GET /skeletons first bytes",
				"GET /skeletons finish 200 N",
				"GET /skeletons close finished=true head=true bytes=N",
			])
			const module = traced().filter((line) => line.startsWith("GET /@vite/client "))
			expect(module[0]).toBe("GET /@vite/client arrived")
			expect(module.at(-1)).toMatch(/^GET \/@vite\/client close finished=true head=true bytes=\d+$/)
		} finally {
			await session.close()
		}
	},
	VITE_BOOT,
)
