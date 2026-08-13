/**
 * AppRoot Component
 *
 * Renders the app container with id="app" for hydration.
 * Accepts all div attributes except id, which is always "app".
 *
 * Usage:
 * <AppRoot class="min-h-screen">{children}</AppRoot>
 */

import { type JSX, splitProps } from "solid-js"

type AppRootProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "id"> & {
	children: JSX.Element
}

function AppRoot(props: AppRootProps): JSX.Element {
	const [local, rest] = splitProps(props, ["children"])

	return (
		<div {...rest} data-testid="app-root" id="app">
			{local.children}
		</div>
	)
}

export type { AppRootProps }

export { AppRoot }
