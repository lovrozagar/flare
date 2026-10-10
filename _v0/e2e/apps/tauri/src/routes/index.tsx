import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/")
	.loader(({ request, serverContext }) => {
		const ua = request.headers.get("user-agent") ?? "unknown";
		const ctx = serverContext as { requestId: string; timestamp: number };
		const isTauriUA = /tauri/i.test(ua);
		return {
			isTauri: isTauriUA,
			name: "Tauri",
			requestId: ctx.requestId,
			timestamp: ctx.timestamp,
			userAgent: ua,
		};
	})
	.head(() => ({ title: "Flare on Tauri" }))
	.render((props) => (
		<div style={{ padding: "2rem" }}>
			<h1>Flare on Tauri</h1>
			<p>
				Platform: <strong data-testid="platform-label">{props.loaderData.isTauri ? "Tauri Webview" : "Browser"}</strong>
			</p>
			<dl>
				<dt>Request ID</dt>
				<dd data-testid="request-id">{props.loaderData.requestId}</dd>
				<dt>User Agent</dt>
				<dd data-testid="user-agent" style={{ "word-break": "break-all" }}>
					{props.loaderData.userAgent}
				</dd>
				<dt>Timestamp</dt>
				<dd data-testid="timestamp">{String(props.loaderData.timestamp)}</dd>
			</dl>
		</div>
	));
