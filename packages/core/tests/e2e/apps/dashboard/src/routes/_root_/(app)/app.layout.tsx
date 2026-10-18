import { createLayout } from "@lovrozagar/flare"
import { SignInRedirect } from "../../../components/sign-in-redirect.tsx"
import { Shell } from "../../../components/shell.tsx"
import { workspaceOf } from "../../../db.ts"

// Every page of the app needs a session. Without one the layout's 401 render sends the visitor to sign in and back.
export const route = createLayout("_root_/(app)")
	.authenticate()
	.loader(({ auth }) => ({
		viewer: {
			name: auth.name,
			email: auth.email,
			role: auth.role,
			workspace: workspaceOf(auth.workspaceId)?.name ?? "",
		},
	}))
	.render((props) => <Shell viewer={props.loaderData.viewer}>{props.children}</Shell>)
	.unauthenticatedRender(() => <SignInRedirect />)
