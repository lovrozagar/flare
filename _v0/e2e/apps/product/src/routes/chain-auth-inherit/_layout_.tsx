import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(chain-auth-inherit)")
	.authenticate("role:editor")
	.preloader((ctx) => {
		const a = ctx.auth as Record<string, unknown> | null;
		return {
			authUserId: String(a?.userId ?? "none"),
			role: "editor",
		};
	})
	.loader((ctx) => {
		const a = ctx.auth as Record<string, unknown> | null;
		return {
			layoutAuth: a,
			layoutPreloaderContext: ctx.preloaderContext,
		};
	})
	.render((props) => (
		<div data-testid="chain-auth-layout">
			<div data-testid="auth-layout-role">{String(props.preloaderContext.role)}</div>
			<div data-testid="auth-layout-userId">{String(props.preloaderContext.authUserId)}</div>
			<div data-testid="auth-layout-has-auth">{String(props.loaderData.layoutAuth !== null)}</div>
			<div data-testid="auth-layout-callerData">
				{JSON.stringify((props.loaderData.layoutAuth as Record<string, unknown>)?.callerData ?? [])}
			</div>
			{props.children}
		</div>
	))
	.unauthorizedRender(() => (
		<div data-testid="chain-auth-unauthorized">
			<p>Unauthorized — please sign in</p>
		</div>
	));
