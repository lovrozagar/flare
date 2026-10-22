import { createServer, type Server } from "node:net"
import { afterEach, expect, it } from "vitest"
import { freePort, onFreePort, PORT_TRIES, portTaken } from "./free-port.ts"

const held: Server[] = []

afterEach(async () => {
	await Promise.all(held.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

// A port another process holds: a listener on 127.0.0.1, as a peer's server would.
async function hold(): Promise<number> {
	const port = await freePort()
	const server = createServer()
	held.push(server)
	await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve))
	return port
}

// What a strict listen does on a held port: Node's EADDRINUSE.
function listenOn(port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer()
		server.once("error", reject)
		server.listen(port, "127.0.0.1", () => {
			held.push(server)
			resolve(port)
		})
	})
}

// A port taken between the pick and the listen is picked again: the start runs on the next free port.
it("taken in between", async () => {
	const taken = await hold()
	const picks = [taken]
	const port = await onFreePort(listenOn, { pick: async () => picks.shift() ?? freePort() })
	expect([port === taken, port > 0]).toEqual([false, true])
})

// Every pick taken: the error names each port it tried, after PORT_TRIES.
it("names every port", async () => {
	const ports = [await hold(), await hold(), await hold()]
	const picks = [...ports]
	const tried = onFreePort(listenOn, { pick: async () => picks.shift() ?? 0 })
	await expect(tried).rejects.toThrow(`no free port after ${PORT_TRIES} tries (${ports.join(", ")})`)
})

// Any other failure is the start's own, not retried.
it("other failures", async () => {
	let starts = 0
	const failing = onFreePort(
		async () => {
			starts += 1
			throw new Error("the app broke")
		},
		{ pick: freePort },
	)
	await expect(failing).rejects.toThrow("the app broke")
	expect(starts).toBe(1)
})

// The signatures of a port taken: Node's code, Vite's strict port, ssh's forward.
it("port taken", () => {
	const taken = [
		"Error: listen EADDRINUSE: address already in use 127.0.0.1:4000",
		"error when starting dev server: Error: Port 37701 is already in use",
		"bind [127.0.0.1]:4000: Address already in use",
	]
	expect(taken.map((text) => portTaken(new Error(text)))).toEqual([true, true, true])
	expect(portTaken(new Error("ECONNREFUSED"))).toBe(false)
})
