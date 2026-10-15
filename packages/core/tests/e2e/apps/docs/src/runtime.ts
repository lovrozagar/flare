import { createIsomorphicFn, createServerOnlyFn } from "@lovrozagar/flare"

// Which runtime rendered this response. The body is server-only: the client chunk does not contain it.
export const serverRuntime = createServerOnlyFn((): string => {
	if (Reflect.get(globalThis, "Bun") !== undefined) return "bun"
	const agent: unknown = Reflect.get(Reflect.get(globalThis, "navigator") ?? {}, "userAgent")
	if (agent === "Cloudflare-Workers") return "workers"
	return "node"
})

// One name, a different body per graph. Each graph keeps only its own side.
export const renderedOn = createIsomorphicFn()
	.server(() => "server")
	.client(() => "client")
