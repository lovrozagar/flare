import { createServer as createNetServer } from "node:net"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { freePort } from "../../../../scripts/free-port.ts"
import { bootApp } from "./boot.ts"

// The dev boot's port race (BUGS.md 493). Split from boot.test.ts at its 500-line limit.

// A test that boots a real vite dev server in a child process, as boot.test's.
const VITE_BOOT = 30_000

const MINIMAL = fileURLToPath(new URL("./apps/minimal/", import.meta.url))

// Ports another process holds: listeners on 127.0.0.1, as a peer's servers would.
async function holdPorts(count: number): Promise<{ port: number; close: () => Promise<void> }[]> {
	return Promise.all(
		Array.from({ length: count }, async () => {
			const server = createNetServer()
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
			const address = server.address()
			const port = typeof address === "object" && address !== null ? address.port : 0
			return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
		}),
	)
}

// A port taken between the pick and Vite's strict listen, as a peer process took 37701 (BUGS.md 493): the dev boot
// picks another and comes up there. With every pick taken, the error names each port it tried.
it(
	"dev port taken",
	async () => {
		const held = await holdPorts(1)
		const picks = held.map((server) => server.port)
		let asked = 0
		const ports = async () => {
			asked += 1
			return picks.shift() ?? freePort()
		}
		const session = await bootApp({ appDir: MINIMAL, runtime: "node", mode: "dev", ports })
		try {
			const port = Number(new URL(session.origin).port)
			const status = (await fetch(`${session.origin}/`)).status
			expect([asked, port === held[0]?.port, status]).toEqual([2, false, 200])
		} finally {
			await session.close()
			await Promise.all(held.map((server) => server.close()))
		}
	},
	VITE_BOOT * 3,
)

it(
	"dev ports all taken",
	async () => {
		const held = await holdPorts(3)
		const picks = held.map((server) => server.port)
		const tried = bootApp({ appDir: MINIMAL, runtime: "node", mode: "dev", ports: async () => picks.shift() ?? 0 })
		try {
			// A boot that comes up anyway, the regression this case catches, is closed, so a red run leaves no dev server.
			const outcome = await tried.then(
				async (session) => {
					await session.close()
					return "booted"
				},
				(error: unknown) => String(error),
			)
			expect(outcome).toContain(`no free port after 3 tries (${held.map((server) => server.port).join(", ")})`)
		} finally {
			await Promise.all(held.map((server) => server.close()))
		}
	},
	VITE_BOOT * 3,
)
