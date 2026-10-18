import { markSafeError, redirect, unauthorized } from "@lovrozagar/flare"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import { inviteMember, membersOf, renameUser, setRole, userById, type Role } from "../db.ts"
import { invalid } from "./issues.ts"

const ROLES: readonly Role[] = ["owner", "admin", "member"]

function roleOf(value: unknown): Role {
	const role = ROLES.find((item) => item === value)
	if (role === undefined) invalid("role", "Unknown role")
	return role
}

// Team changes are an admin's or the owner's. The page's own gate hides the controls; the call checks again.
function manager(role: Role): void {
	if (role === "member") throw unauthorized()
}

// The profile form's save answers with a redirect to the profile, so it loads fresh with the saved name.
export const saveProfile = createServerFn()
	.authenticate()
	.input({
		parse: (value: { name: string }) => {
			const name = typeof value.name === "string" ? value.name.trim().replaceAll(/\s+/g, " ") : ""
			if (name.length < 2 || name.length > 40) invalid("name", "Use 2 to 40 characters")
			return { name }
		},
	})
	.handler(({ auth, input }) => {
		renameUser(auth.userId, input.name)
		throw redirect({ to: "_root_/(app)/settings/profile" })
	})

// An invite adds the email to the caller's workspace with a role; that email's sign-in then lands there.
export const invite = createServerFn()
	.authenticate()
	.input({
		parse: (value: { email: string; role: string }) => {
			const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : ""
			if (!/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) invalid("email", "Enter an email address")
			const role = roleOf(value.role)
			if (role === "owner") invalid("role", "A workspace has one owner")
			return { email, role }
		},
	})
	.handler(({ auth, input }) => {
		manager(auth.role)
		const user = inviteMember(auth.workspaceId, input.email, input.role)
		if (user.workspaceId !== auth.workspaceId) throw markSafeError(new Error(`${input.email} has a workspace`))
		return { id: user.id, email: user.email, role: user.role }
	})

// A member's role, set by an admin or the owner. The owner's own role does not change here.
export const changeRole = createServerFn()
	.authenticate()
	.input({
		parse: (value: { userId: string; role: string }) => {
			const role = roleOf(value.role)
			if (role === "owner") invalid("role", "A workspace has one owner")
			return { userId: String(value.userId), role }
		},
	})
	.handler(({ auth, input }) => {
		manager(auth.role)
		const target = userById(input.userId)
		if (target === undefined || target.workspaceId !== auth.workspaceId)
			throw markSafeError(new Error("No such member"))
		if (target.role === "owner") throw markSafeError(new Error("The owner's role does not change"))
		setRole(target.id, input.role)
		return {
			members: membersOf(auth.workspaceId).map((member) => ({ id: member.id, email: member.email, role: member.role })),
		}
	})
