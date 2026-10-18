import { markSafeError, redirect } from "@lovrozagar/flare"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import {
	addProject,
	listProjects,
	nameTaken,
	projectOf,
	removeProject,
	updateProject,
	type ProjectQuery,
	type Status,
} from "../db.ts"
import { checkedQuery, STATUSES } from "../search.ts"
import { invalid, invalidFields } from "./issues.ts"

// The workspace's projects, behind the session: every call reads the caller's own workspace, never one it names.

export const projectPage = createServerFn({ method: "get" })
	.authenticate()
	.input({ parse: (value: ProjectQuery) => checkedQuery(value) })
	.handler(({ auth, input }) => listProjects(auth.workspaceId, input))

export const projectDetail = createServerFn({ method: "get" })
	.authenticate()
	.input({ parse: (value: { id: number }) => ({ id: idOf(value.id) }) })
	.handler(({ auth, input }) => projectOf(auth.workspaceId, input.id) ?? null)

function idOf(value: unknown): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) invalid("id", "Unknown project")
	return value
}

function nameOf(value: unknown): string {
	return typeof value === "string" ? value.trim().replaceAll(/\s+/g, " ") : ""
}

function nameProblem(name: string): string | undefined {
	if (name.length < 2) return "Use at least 2 characters"
	if (name.length > 40) return "Use at most 40 characters"
	return undefined
}

// A taken name is the server's answer, not the form's: a safe error, so production shows its message too.
function unique(workspaceId: string, name: string, except?: number): void {
	if (nameTaken(workspaceId, name, except)) throw markSafeError(new Error(`A project named "${name}" exists`))
}

type NewProject = { name: string; budget: number; status: Status }

// Every field's problem at once, so the form marks each field it has to.
function newProject(value: { name: string; budget: string | number; status?: string }): NewProject {
	const name = nameOf(value.name)
	const budget = typeof value.budget === "number" ? value.budget : Number(value.budget)
	const status = STATUSES.find((item) => item === value.status) ?? "active"
	const problems: { field: string; message: string }[] = []
	const named = nameProblem(name)
	if (named !== undefined) problems.push({ field: "name", message: named })
	if (!Number.isFinite(budget) || budget < 0 || !Number.isInteger(budget)) {
		problems.push({ field: "budget", message: "Use a whole number of dollars, 0 or more" })
	}
	if (problems.length > 0) invalidFields(problems)
	return { name, budget, status }
}

// The form's create: it answers with a redirect to the table, newest first, so the table loads fresh.
export const createProject = createServerFn()
	.authenticate()
	.input({ parse: newProject })
	.handler(({ auth, input }) => {
		unique(auth.workspaceId, input.name)
		addProject(auth.workspaceId, input)
		throw redirect({ to: "_root_/(app)/projects", search: { sort: "updated", dir: "desc", page: 1 } })
	})

// The table's quick add: it answers with the new row, which the table puts in place of its optimistic one.
export const quickAdd = createServerFn()
	.authenticate()
	.input({ parse: (value: { name: string }) => newProject({ name: value.name, budget: 0 }) })
	.handler(({ auth, input }) => {
		unique(auth.workspaceId, input.name)
		return addProject(auth.workspaceId, input)
	})

export const renameProject = createServerFn()
	.authenticate()
	.input({
		parse: (value: { id: number; name: string }) => {
			const name = nameOf(value.name)
			const problem = nameProblem(name)
			if (problem !== undefined) invalid("name", problem)
			return { id: idOf(value.id), name }
		},
	})
	.handler(({ auth, input }) => {
		unique(auth.workspaceId, input.name, input.id)
		const project = updateProject(auth.workspaceId, input.id, { name: input.name })
		if (project === undefined) throw markSafeError(new Error("That project is gone"))
		return project
	})

export const archiveProject = createServerFn()
	.authenticate()
	.input({ parse: (value: { id: number }) => ({ id: idOf(value.id) }) })
	.handler(({ auth, input }) => {
		const project = updateProject(auth.workspaceId, input.id, { status: "archived" })
		if (project === undefined) throw markSafeError(new Error("That project is gone"))
		return project
	})

export const deleteProject = createServerFn()
	.authenticate()
	.input({ parse: (value: { id: number }) => ({ id: idOf(value.id) }) })
	.handler(({ auth, input }) => ({ deleted: removeProject(auth.workspaceId, input.id) }))
