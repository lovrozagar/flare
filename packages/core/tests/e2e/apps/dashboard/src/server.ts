import { createMemoryStore, createMiddleware, createServer } from "@lovrozagar/flare/server"
import { serverFns } from "./_gen/server-fns.gen.ts"
import { router } from "./router.ts"
import { sessionOf } from "./session.ts"

// The e2e boot's capture check (dashboard.fixture.ts): one console line at this server's first request, which the
// boot must capture on every runtime, workerd's console included.
const probe = { logged: false }

const capture = createMiddleware(() => {
	if (probe.logged) return
	probe.logged = true
	console.error("[dashboard:probe] server up")
})

// The options the docs app leaves at their defaults take their other values here (B146): one memory store on every
// runtime, built once outside any request, and a document held until its defers settle.
export const server = createServer({
	router,
	serverFns,
	site: "https://dashboard.test",
	authenticate: ({ request, env }) => sessionOf(request, env),
	middleware: [capture],
	store: createMemoryStore(),
	documentResponseDefer: "buffer",
	security: { "Content-Security-Policy": { "frame-src": ["'none'"], "form-action": ["'self'"] } },
	// The old home of the overview redirects to it, its query kept (dx/server.md rewrite).
	rewrite: (path) => (path === "/app/home" ? "/app/overview" : undefined),
})
