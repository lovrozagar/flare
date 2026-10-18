import { markSafeError } from "@lovrozagar/flare"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import { endSessions, setRole, signInUser, type Role } from "../db.ts"
import { PASSWORD } from "../demo.ts"
import { e2eOnly } from "../e2e.ts"
import { CLEAR_SESSION, sessionCookie } from "../session.ts"
import { invalid } from "./issues.ts"

// A sign-in is a server function whose returned Response sets the cookie (dx/server-fn.md Wire). The validator names
// a malformed field; a wrong password is a safe error, so production shows its message too.
export const signIn = createServerFn()
	.input({
		parse: (value: { email: string; password: string }) => {
			const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : ""
			if (!/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) invalid("email", "Enter an email address")
			const password = typeof value.password === "string" ? value.password : ""
			if (password === "") invalid("password", "Enter your password")
			return { email, password }
		},
	})
	.handler(async ({ input, env }) => {
		if (input.password !== PASSWORD) throw markSafeError(new Error("Wrong email or password"))
		const user = signInUser(input.email)
		const cookie = await sessionCookie(env, user.id, user.version)
		return new Response(null, { status: 204, headers: { "set-cookie": cookie } })
	})

// Signing out clears the cookie and ends the session on the server, so a copy of the cookie stops working too.
export const signOut = createServerFn()
	.authenticate()
	.handler(({ auth }) => {
		endSessions(auth.userId)
		return new Response(null, { status: 204, headers: { "set-cookie": CLEAR_SESSION } })
	})

// e2e only: the session ends on the server while the browser keeps its cookie, as an expiry or a sign-out elsewhere
// does.
export const expireSession = createServerFn()
	.authenticate()
	.handler(({ auth, env }) => {
		e2eOnly(env)
		endSessions(auth.userId)
		return { ended: true }
	})

// e2e only: the signed-in user's own role, as an owner changing it on the team page would.
export const assignRole = createServerFn()
	.authenticate()
	.input({
		parse: (value: { role: Role }) => {
			if (value.role !== "owner" && value.role !== "admin" && value.role !== "member") invalid("role", "Unknown role")
			return value
		},
	})
	.handler(({ auth, env, input }) => {
		e2eOnly(env)
		setRole(auth.userId, input.role)
		return { role: input.role }
	})
