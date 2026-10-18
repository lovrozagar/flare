// The dashboard's data, in this server's memory for the life of the boot (B146). Each user's first sign-in creates
// their own workspace with seeded projects, so cases that share one boot never share rows.

export type Role = "owner" | "admin" | "member"
export type Status = "active" | "paused" | "archived"
export type Plan = "free" | "pro"

export type Project = { id: number; name: string; status: Status; budget: number; updated: Date }
export type User = { id: string; email: string; name: string; workspaceId: string; role: Role; version: number }
export type Workspace = { id: string; name: string; plan: Plan; projects: Project[]; nextId: number }

const users = new Map<string, User>()
const usersById = new Map<string, User>()
const workspaces = new Map<string, Workspace>()

const NAMES = ["Atlas", "Beacon", "Cinder", "Delta", "Ember", "Fjord", "Garnet", "Harbor", "Indigo", "Juniper"]
const STATUSES: readonly Status[] = ["active", "active", "paused", "archived"]
const DAY = 24 * 60 * 60 * 1000
// Seeded dates count back from a fixed day, so every workspace holds the same table.
const SEEDED = Date.UTC(2026, 9, 1)

// 24 projects: names, statuses, budgets, and dates that sort differently by each column.
function seed(): Project[] {
	return Array.from({ length: 24 }, (_, index) => ({
		id: index + 1,
		name: `${NAMES[index % NAMES.length]} ${Math.floor(index / NAMES.length) + 1}`,
		status: STATUSES[index % STATUSES.length] ?? "active",
		budget: ((index * 7919) % 50) * 1000 + 500,
		updated: new Date(SEEDED - ((index * 5) % 24) * DAY),
	}))
}

function nameOf(email: string): string {
	const local = email.split("@")[0] ?? email
	return local.charAt(0).toUpperCase() + local.slice(1)
}

// The user for an email, created with an owned workspace on first sign-in.
export function signInUser(email: string): User {
	const known = users.get(email)
	if (known !== undefined) return known
	const id = crypto.randomUUID()
	const workspace: Workspace = {
		id: crypto.randomUUID(),
		name: `${nameOf(email)}'s team`,
		plan: "free",
		projects: seed(),
		nextId: 25,
	}
	workspaces.set(workspace.id, workspace)
	const user: User = { id, email, name: nameOf(email), workspaceId: workspace.id, role: "owner", version: 1 }
	users.set(email, user)
	usersById.set(id, user)
	return user
}

export function userById(id: string): User | undefined {
	return usersById.get(id)
}

export function workspaceOf(id: string): Workspace | undefined {
	return workspaces.get(id)
}

export function setRole(userId: string, role: Role): void {
	const user = usersById.get(userId)
	if (user !== undefined) user.role = role
}

// Every session issued before this call stops verifying: the server side of a sign-out everywhere or an expiry.
export function endSessions(userId: string): void {
	const user = usersById.get(userId)
	if (user !== undefined) user.version += 1
}
