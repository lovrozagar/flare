import { expect, it, vi } from "vitest"
import { createIsomorphicFn, pickSide } from "./isomorphic.ts"

function sides() {
	return {
		server: vi.fn<(n: number) => string>((n) => `server ${n}`),
		client: vi.fn<(n: number) => string>((n) => `client ${n}`),
	}
}

// The rewrite drops one side's body, so that call has no argument. It is not typed config, so it is applied raw.
function bare(method: unknown): (n: number) => string {
	return Reflect.apply(Function.prototype.call, method, [undefined])
}

it("server", () => {
	// The ssr graph keeps the server body and drops the client one.
	const { server, client } = sides()
	const format = bare(createIsomorphicFn().server(server).client)
	expect(format(1)).toBe("server 1")
	expect(client).not.toHaveBeenCalled()
	// Untransformed, both bodies are present, and the server build runs the server one.
	const both = createIsomorphicFn().client(client).server(server)
	expect(both(2)).toBe("server 2")
	expect(client).not.toHaveBeenCalled()
})

it("client", () => {
	// The client and worker graphs keep the client body and drop the server one.
	const { server, client } = sides()
	const format = bare(createIsomorphicFn().client(client).server)
	expect(format(3)).toBe("client 3")
	expect(server).not.toHaveBeenCalled()
	// Untransformed in a browser build, both bodies are present and the client one runs.
	expect(pickSide(false, server, client)(4)).toBe("client 4")
	expect(server).not.toHaveBeenCalled()
})

it("missing", () => {
	const { server, client } = sides()
	const half = createIsomorphicFn().server(server)
	expect(() => half()).toThrow("createIsomorphicFn needs both .server() and .client()")
	expect(server).not.toHaveBeenCalled()
	const empty: (n: number) => string = Reflect.apply(
		Reflect.apply(Function.prototype.call, createIsomorphicFn().server, [undefined]).client,
		undefined,
		[],
	)
	expect(() => empty(1)).toThrow("createIsomorphicFn has no body for this side")
	expect(() => Reflect.apply(Function.prototype.call, Reflect.get(half, "server"), [undefined, server])).toThrow(
		".server() twice",
	)
	const other = createIsomorphicFn().client(client)
	expect(() => Reflect.apply(Function.prototype.call, Reflect.get(other, "client"), [undefined, client])).toThrow(
		".client() twice",
	)
})
