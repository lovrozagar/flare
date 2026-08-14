import { createPage } from "flare/page"

export const route = createPage("_root_/server-log-test")
	.loader(async () => {
		const { serverLog } = await import("flare/server-context")
		serverLog("log", "hello from loader")
		return { ok: true }
	})
	.render((props) => (
		<main data-testid="server-log-test">
			<p data-testid="status">{props.loaderData.ok ? "ok" : "fail"}</p>
		</main>
	))
