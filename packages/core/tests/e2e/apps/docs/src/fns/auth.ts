import { createServerFn } from "@lovrozagar/flare/server-fn"
import { CLEAR_SESSION, sessionCookie } from "../session.ts"
import { invalid } from "./issues.ts"

// A returned Response is the HTTP response, so its Set-Cookie reaches the browser (dx/server-fn.md Wire).
export const login = createServerFn()
	.input({
		parse: (value: { user: string; role: string }) => {
			const user = typeof value.user === "string" ? value.user.trim() : ""
			if (!/^[a-z]{2,16}$/.test(user)) invalid("user", "Use 2 to 16 lowercase letters")
			return { user, role: value.role === "admin" ? "admin" : "reader" }
		},
	})
	.handler(
		({ input }) =>
			new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(input.user, input.role) } }),
	)

export const logout = createServerFn().handler(
	() => new Response(null, { status: 204, headers: { "set-cookie": CLEAR_SESSION } }),
)
