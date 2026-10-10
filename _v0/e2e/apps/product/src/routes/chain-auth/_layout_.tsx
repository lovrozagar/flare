import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(chain-auth)")
	.authenticate()
	.loader((ctx) => {
		const a = ctx.auth as Record<string, unknown> | null;
		return {
			callerData: JSON.stringify(a?.callerData ?? []),
			userId: String(a?.userId ?? ""),
		};
	})
	.render((props) => (
		<div data-testid="chain-auth-layout">
			<p data-testid="auth-layout-userId">{props.loaderData.userId}</p>
			<p data-testid="auth-layout-callerData">{props.loaderData.callerData}</p>
			{props.children}
		</div>
	));
