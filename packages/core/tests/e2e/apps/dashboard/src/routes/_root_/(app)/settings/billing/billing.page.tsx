import { createPage } from "@lovrozagar/flare"
import { workspaceOf } from "../../../../../db.ts"

// The owner's page. No route on this chain has an `unauthorizedRender`, so anyone else gets Flare's built-in 403.
export const route = createPage("_root_/(app)/settings/billing")
	.authorize(({ auth }) => auth.role === "owner")
	.loader(({ auth }) => ({ plan: workspaceOf(auth.workspaceId)?.plan ?? "free" }))
	.head(() => ({ title: "Billing — Dashboard" }))
	.render((props) => (
		<section>
			<h1 id="title" class="text-lg font-semibold">
				Billing
			</h1>
			<p class="mt-4 text-sm">
				Plan: <strong id="plan">{props.loaderData.plan}</strong>
			</p>
		</section>
	))
