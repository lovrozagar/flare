import { createPage } from "flare/page"

export const route = createPage("_root_/")
	.loader(({ request, serverContext }) => {
		const ua = request.headers.get("user-agent") ?? "unknown"
		const ctx = serverContext as { requestId: string; timestamp: number }
		const isTauriUA = /tauri/i.test(ua)
		return {
			isTauri: isTauriUA,
			name: "Tauri",
			requestId: ctx.requestId,
			timestamp: ctx.timestamp,
			userAgent: ua,
		}
	})
	.head(() => ({ title: "Flare on Tauri" }))
	.render((props) => (
		<div style={{ padding: "2rem" }}>
			<h1>Flare on Tauri</h1>
			<p>
				Platform: <strong>{props.loaderData.isTauri ? "Tauri Webview" : "Browser"}</strong>
			</p>
			<dl>
				<dt>Request ID</dt>
				<dd>{props.loaderData.requestId}</dd>
				<dt>User Agent</dt>
				<dd style={{ "word-break": "break-all" }}>{props.loaderData.userAgent}</dd>
				<dt>Timestamp</dt>
				<dd>{String(props.loaderData.timestamp)}</dd>
			</dl>
		</div>
	))
