import { createPage } from "flare/page"
import { useTheme } from "flare/theme"

export const route = createPage("_root_/theme-dir").render(() => {
	const theme = useTheme()
	return (
		<main data-testid="theme-dir">
			<p data-testid="theme-page">scripts</p>
			<p data-testid="theme-value">{theme.theme()}</p>
			<p data-testid="theme-resolved">{theme.resolvedTheme()}</p>
			<button data-testid="theme-toggle" type="button" onClick={() => theme.toggleTheme()}>
				Toggle
			</button>
		</main>
	)
})
