import { createPage } from "@lovrozagar/flare"
import { createSignal, For, Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import { membersOf, type Role } from "../../../../../db.ts"
import { changeRole, invite } from "../../../../../fns/settings.ts"
import { fieldError } from "../../../../../fns/issues.ts"

type Member = { id: string; email: string; role: Role }

const INPUT = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"

function messageOf(error: unknown): string {
	return fieldError(error, "email") ?? (error instanceof Error ? error.message : String(error))
}

// One member: their email and role. The owner's role and the viewer's own are text; any other is a select.
function MemberRow(props: {
	member: Member
	self: string
	assign: (userId: string, role: string) => void
}): JSX.Element {
	return (
		<tr class="border-b border-slate-100" data-email={props.member.email}>
			<td class="py-2">{props.member.email}</td>
			<td class="py-2">
				<Show
					when={props.member.role !== "owner" && props.member.id !== props.self}
					fallback={<span class="member-role">{props.member.role}</span>}
				>
					<select
						class="member-role rounded border border-slate-300 px-1 text-sm"
						aria-label={`Role of ${props.member.email}`}
						value={props.member.role}
						onChange={(event) => props.assign(props.member.id, event.currentTarget.value)}
					>
						<option value="admin">admin</option>
						<option value="member">member</option>
					</select>
				</Show>
			</td>
		</tr>
	)
}

// An invite: an email and its role.
function InviteForm(props: { invite: (email: string, role: Role) => Promise<boolean> }): JSX.Element {
	const [email, setEmail] = createSignal("")
	const [role, setRole] = createSignal<Role>("member")
	const submit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault()
		if (await props.invite(email(), role())) setEmail("")
	}
	return (
		<form id="invite-form" class="mt-6 flex items-end gap-2" onSubmit={(event) => void submit(event)}>
			<input
				id="invite-email"
				class={INPUT}
				placeholder="name@company.com"
				value={email()}
				onInput={(event) => setEmail(event.currentTarget.value)}
			/>
			<select
				id="invite-role"
				class={INPUT}
				value={role()}
				onChange={(event) => setRole(event.currentTarget.value === "admin" ? "admin" : "member")}
			>
				<option value="member">member</option>
				<option value="admin">admin</option>
			</select>
			<button id="invite" type="submit" class="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white">
				Invite
			</button>
		</form>
	)
}

// The team: who is in the workspace and their roles. An admin or the owner invites and changes roles here; the list
// takes each answer as it comes.
function Team(props: { members: Member[]; self: string }): JSX.Element {
	// Writable, and reset to the loader's list when a navigation reloads it.
	const [members, setMembers] = createSignal(() => props.members)
	const [error, setError] = createSignal("")
	const add = async (email: string, role: Role): Promise<boolean> => {
		setError("")
		try {
			const added = await invite({ email, role })
			setMembers((list) => [...list.filter((member) => member.email !== added.email), added])
			return true
		} catch (thrown) {
			setError(messageOf(thrown))
			return false
		}
	}
	const assign = (userId: string, role: string): void => {
		setError("")
		changeRole({ userId, role }).then(
			(answer) => setMembers(answer.members),
			(thrown: unknown) => setError(messageOf(thrown)),
		)
	}
	return (
		<div>
			<table id="members" class="w-full max-w-xl text-sm">
				<tbody>
					<For each={members()} keyed={(member) => member.email}>
						{(member) => <MemberRow member={member()} self={props.self} assign={assign} />}
					</For>
				</tbody>
			</table>
			<InviteForm invite={add} />
			<p id="team-error" class="mt-2 text-xs text-red-700">
				{error()}
			</p>
		</div>
	)
}

// An admin's page. A member gets this page's own 403 render, inside the settings tabs.
export const route = createPage("_root_/(app)/settings/team")
	.authorize(({ auth }) => auth.role !== "member")
	.loader(({ auth }) => ({
		self: auth.userId,
		members: membersOf(auth.workspaceId).map((member) => ({ id: member.id, email: member.email, role: member.role })),
	}))
	.head(() => ({ title: "Team — Dashboard" }))
	.render((props) => (
		<section>
			<h1 id="title" class="mb-4 text-lg font-semibold">
				Team
			</h1>
			<Team members={props.loaderData.members} self={props.loaderData.self} />
		</section>
	))
	.unauthorizedRender(() => (
		<section id="team-403">
			<h1 class="text-lg font-semibold">Admins only</h1>
			<p class="mt-2 text-sm text-slate-500">Ask an admin of this workspace to change your role.</p>
		</section>
	))
