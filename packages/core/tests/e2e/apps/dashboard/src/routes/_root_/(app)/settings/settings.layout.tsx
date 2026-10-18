import { createLayout, Link } from "@lovrozagar/flare"
import { Show } from "solid-js"

const TAB = "rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
const ACTIVE = "bg-slate-100 font-medium text-slate-900"

// The settings section: its own tabs over each settings page. Team is an admin's, Billing the owner's.
export const route = createLayout("_root_/(app)/settings")
	.loader(({ auth }) => ({ role: auth.role }))
	.render((props) => (
		<div>
			<nav id="settings-tabs" class="mb-6 flex gap-1 border-b border-slate-200 pb-2" aria-label="Settings">
				<Link to="_root_/(app)/settings/profile" class={TAB} activeClass={ACTIVE}>
					Profile
				</Link>
				<Show when={props.loaderData.role !== "member"}>
					<Link to="_root_/(app)/settings/team" class={TAB} activeClass={ACTIVE}>
						Team
					</Link>
				</Show>
				<Show when={props.loaderData.role === "owner"}>
					<Link to="_root_/(app)/settings/billing" class={TAB} activeClass={ACTIVE}>
						Billing
					</Link>
				</Show>
			</nav>
			{props.children}
		</div>
	))
