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

export type Sort = "name" | "updated" | "budget"
export type Dir = "asc" | "desc"

// What the projects table shows: its filters, its order, and the page (projects.page.tsx validates it from the URL).
export type ProjectQuery = {
	q?: string | undefined
	status?: Status[] | undefined
	sort: Sort
	dir: Dir
	page: number
	from?: Date | undefined
	to?: Date | undefined
}

export const PAGE_SIZE = 8

export type ProjectPage = { rows: Project[]; total: number; pages: number; page: number }

function compare(sort: Sort, left: Project, right: Project): number {
	if (sort === "name") return left.name.localeCompare(right.name)
	if (sort === "budget") return left.budget - right.budget
	return left.updated.getTime() - right.updated.getTime()
}

// One page of a workspace's projects: filtered, ordered with the id as the tie-break, then cut to the page.
export function listProjects(workspaceId: string, query: ProjectQuery): ProjectPage {
	const all = workspaces.get(workspaceId)?.projects ?? []
	const q = query.q?.trim().toLowerCase() ?? ""
	const kept = all.filter(
		(project) =>
			(q === "" || project.name.toLowerCase().includes(q)) &&
			(query.status === undefined || query.status.length === 0 || query.status.includes(project.status)) &&
			(query.from === undefined || project.updated.getTime() >= query.from.getTime()) &&
			(query.to === undefined || project.updated.getTime() <= query.to.getTime()),
	)
	const sign = query.dir === "asc" ? 1 : -1
	const ordered = kept.toSorted((left, right) => sign * compare(query.sort, left, right) || left.id - right.id)
	const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
	const page = Math.min(Math.max(1, query.page), pages)
	return { rows: ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: ordered.length, pages, page }
}

export function projectOf(workspaceId: string, id: number): Project | undefined {
	return workspaces.get(workspaceId)?.projects.find((project) => project.id === id)
}

// A name is unique in its workspace, whatever its case.
export function nameTaken(workspaceId: string, name: string, except?: number): boolean {
	const lower = name.toLowerCase()
	return (workspaces.get(workspaceId)?.projects ?? []).some(
		(project) => project.id !== except && project.name.toLowerCase() === lower,
	)
}

export function addProject(workspaceId: string, fields: { name: string; budget: number; status: Status }): Project {
	const workspace = workspaces.get(workspaceId)
	if (workspace === undefined) throw new Error("no workspace")
	const project: Project = { id: workspace.nextId, ...fields, updated: new Date() }
	workspace.nextId += 1
	workspace.projects.push(project)
	return project
}

export function updateProject(
	workspaceId: string,
	id: number,
	fields: Partial<Pick<Project, "name" | "status" | "budget">>,
): Project | undefined {
	const project = projectOf(workspaceId, id)
	if (project === undefined) return undefined
	Object.assign(project, fields, { updated: new Date() })
	return project
}

export function removeProject(workspaceId: string, id: number): boolean {
	const workspace = workspaces.get(workspaceId)
	if (workspace === undefined) return false
	const before = workspace.projects.length
	workspace.projects = workspace.projects.filter((project) => project.id !== id)
	return workspace.projects.length < before
}

// A workspace's people, owner first, then by email.
export function membersOf(workspaceId: string): User[] {
	const rank = { owner: 0, admin: 1, member: 2 } as const
	return [...usersById.values()]
		.filter((user) => user.workspaceId === workspaceId)
		.toSorted((left, right) => rank[left.role] - rank[right.role] || left.email.localeCompare(right.email))
}

// An invited email joins the inviter's workspace with a role; signing in with it later lands there, not in a new one.
export function inviteMember(workspaceId: string, email: string, role: Role): User {
	const known = users.get(email)
	if (known !== undefined) return known
	const id = crypto.randomUUID()
	const user: User = { id, email, name: nameOf(email), workspaceId, role, version: 1 }
	users.set(email, user)
	usersById.set(id, user)
	return user
}

export function renameUser(userId: string, name: string): void {
	const user = usersById.get(userId)
	if (user !== undefined) user.name = name
}

export function setPlan(workspaceId: string, plan: Plan): boolean {
	const workspace = workspaces.get(workspaceId)
	if (workspace === undefined) return false
	workspace.plan = plan
	return true
}

// A user by email, if they ever signed in or were invited.
export function signedUpUser(email: string): User | undefined {
	return users.get(email.toLowerCase())
}
