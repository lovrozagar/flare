import { createPage } from "flare/page"

export const route = createPage("_root_/(chain-auth-inherit)/chain-auth-inherit/")
	.loader((ctx) => {
		const a = ctx.auth as Record<string, unknown> | null
		return {
			pageAuth: a,
			pagePreloaderContext: ctx.preloaderContext,
		}
	})
	.render((props) => (
		<div data-testid="chain-auth-page">
			<div data-testid="auth-page-has-auth">{String(props.loaderData.pageAuth !== null)}</div>
			<div data-testid="auth-page-userId">
				{String((props.loaderData.pageAuth as Record<string, unknown>)?.userId ?? "none")}
			</div>
			<div data-testid="auth-page-role">{String(props.preloaderContext.role)}</div>
			<div data-testid="auth-page-authUserId">{String(props.preloaderContext.authUserId)}</div>
			<div data-testid="auth-page-callerData">
				{JSON.stringify((props.loaderData.pageAuth as Record<string, unknown>)?.callerData ?? [])}
			</div>
			<div data-testid="auth-page-snapshot">
				{JSON.stringify(props.loaderData.pagePreloaderContext)}
			</div>
		</div>
	))
