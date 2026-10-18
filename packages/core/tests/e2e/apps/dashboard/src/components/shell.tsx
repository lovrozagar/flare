import { InterceptOutlet, Link, useNavigate } from "@lovrozagar/flare"
import { Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import type { Role } from "../db.ts"
import { signOut } from "../fns/auth.ts"
import { DEFAULT_SEARCH } from "../search.ts"

export type Viewer = { name: string; email: string; role: Role; workspace: string }

const NAV = "block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
const ACTIVE = "bg-brand-50 font-medium text-brand-700"

// The signed-in frame: a sidebar of sections, a top bar with the workspace and the user, and the page beside them.
export function Shell(props: { viewer: Viewer; children: JSX.Element }): JSX.Element {
	const navigate = useNavigate()
	// The returned Response clears the cookie, so Flare drops every held page and prefetch itself (B133).
	const leave = async (): Promise<void> => {
		await signOut()
		await navigate({ to: "_root_/login", replace: true })
	}
	return (
		<div class="flex min-h-screen">
			<aside id="sidebar" class="w-56 shrink-0 border-r border-slate-200 bg-white px-3 py-5">
				<p class="px-3 text-sm font-semibold text-slate-900">
					<span class="me-2 inline-block size-2 rounded-full bg-brand-500" />
					Dashboard
				</p>
				<nav class="mt-6 space-y-1" aria-label="Sections">
					<Link to="_root_/(app)/projects" search={DEFAULT_SEARCH} class={NAV} activeClass={ACTIVE}>
						Projects
					</Link>
					<Show when={props.viewer.role === "owner"}>
						<Link to="_root_/(app)/settings/billing" class={NAV} activeClass={ACTIVE}>
							Billing
						</Link>
					</Show>
				</nav>
			</aside>
			<div class="flex min-w-0 flex-1 flex-col">
				<header id="topbar" class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
					<p id="workspace" class="text-sm font-medium text-slate-700">
						{props.viewer.workspace}
					</p>
					<div class="flex items-center gap-4 text-sm">
						<span id="viewer" data-role={props.viewer.role}>
							{props.viewer.email}
						</span>
						<button id="sign-out" type="button" class="text-slate-500 underline" onClick={() => void leave()}>
							Sign out
						</button>
					</div>
				</header>
				<main id="page" class="flex-1 px-6 py-6">
					{props.children}
				</main>
				<ProjectDialog />
			</div>
		</div>
	)
}

// A project opened from the table shows here, over the table, which stays mounted (dx/navigate.md InterceptOutlet).
function ProjectDialog(): JSX.Element {
	return (
		<InterceptOutlet>
			{(state) => (
				<div class="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/30 p-6 pt-20">
					<div
						id="project-dialog"
						role="dialog"
						aria-label="Project"
						data-label={state.render}
						data-background={state.backgroundLocation.pathname}
						class="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
					>
						<div class="mb-2 flex justify-end">
							<button id="dialog-close" type="button" class="text-sm text-slate-500" onClick={() => state.dismiss()}>
								Close
							</button>
						</div>
						{state.match.render()}
					</div>
				</div>
			)}
		</InterceptOutlet>
	)
}
