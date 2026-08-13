import { createPage } from "flare/page"

export const route = createPage("_root_/server-log-test")
	.loader(async () => {
		/* Dynamic import to keep node:async_hooks out of the client bundle */
		const { serverLog } = await import("flare/server-context")
		serverLog("log", "hello from loader")
		serverLog("warn", "loader warning", 42)
		serverLog("error", "loader error", { detail: "test" })
		return { ok: true }
	})
	.render((props) => (
		<div>
			<h1>Server Log Test</h1>
			<p data-testid="status">{props.loaderData.ok ? "ok" : "fail"}</p>
		</div>
	))
