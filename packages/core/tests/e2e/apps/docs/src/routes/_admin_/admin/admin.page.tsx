import { createPage } from "@lovrozagar/flare";
import { createSignal } from "solid-js";
import { republish } from "../../../fns/republish.ts";

// Required auth with caller data, then a role check. A guest gets the root's 401 boundary, a reader its 403.
export const route = createPage("_admin_/admin")
	.authenticate("admin")
	.authorize(({ auth }) => auth.role === "admin")
	.preloader(({ auth }) => ({ greeting: `Hi ${auth.user}` }))
	.loader(({ auth, preloaderContext }) => ({
		user: auth.user,
		callerData: auth.callerData,
		greeting: preloaderContext.greeting,
	}))
	.render((props) => {
		const [purged, setPurged] = createSignal("");
		const purge = async (): Promise<void> => {
			const result = await republish();
			setPurged(result.purged.join(", "));
		};
		return (
			<main>
				<h1 id="admin-greeting" class="text-2xl font-semibold">
					{props.loaderData.greeting}
				</h1>
				<dl class="mt-6 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
					<dt class="text-stone-500">user</dt>
					<dd id="admin-user" class="font-mono">
						{props.loaderData.user}
					</dd>
					<dt class="text-stone-500">callerData</dt>
					<dd id="admin-caller" class="font-mono">
						{JSON.stringify(props.loaderData.callerData)}
					</dd>
				</dl>
				<button
					id="republish"
					type="button"
					class="mt-8 rounded-md bg-flame-500 px-3 py-1.5 text-sm font-medium text-white"
					onClick={() => void purge()}
				>
					Republish the API reference
				</button>
				<p class="mt-2 text-sm">
					purged: <span id="purged">{purged()}</span>
				</p>
			</main>
		);
	});
