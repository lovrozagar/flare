import { createServer } from "node:net"

// A port the OS has just assigned on 127.0.0.1, released for a server to take with Vite's `strictPort`. Vite 8 reads
// port 0 as no port and walks up from 5173, where other servers on the machine live (BUGS.md 486), and `strictPort`
// makes a port taken in between fail the boot instead of moving it.
export function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer()
		server.once("error", reject)
		server.listen(0, "127.0.0.1", () => {
			const address = server.address()
			server.close(() => resolve(typeof address === "object" && address !== null ? address.port : 0))
		})
	})
}

export const PORT_TRIES = 3

// Whether a start failed because its port was taken: Node's code, Vite's strict port, ssh's forward.
export function portTaken(error: unknown): boolean {
	return /EADDRINUSE|already in use/i.test(String(error))
}

// Runs `start` on a free port, and on another when that one was taken between the pick and the listen, which no pick
// can prevent: another process may take it in that gap (BUGS.md 493). After PORT_TRIES the error names every port it
// tried. Any other failure is the start's own.
export async function onFreePort<T>(
	start: (port: number) => Promise<T>,
	at: { pick?: () => Promise<number> } = {},
): Promise<T> {
	const pick = at.pick ?? freePort
	const tried: number[] = []
	for (;;) {
		const port = await pick()
		tried.push(port)
		try {
			return await start(port)
		} catch (error) {
			if (!portTaken(error)) throw error
			if (tried.length >= PORT_TRIES) {
				throw new Error(`no free port after ${tried.length} tries (${tried.join(", ")}): ${String(error)}`, {
					cause: error,
				})
			}
		}
	}
}
