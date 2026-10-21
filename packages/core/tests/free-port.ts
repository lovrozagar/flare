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
