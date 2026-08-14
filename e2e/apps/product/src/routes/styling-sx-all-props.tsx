import { createPage } from "flare/page"

/* Every sx prop category: flat, pseudo, @media, @supports, @container, variants, nested :where */
export const route = createPage("_root_/styling-sx-all-props").render(() => {
	return (
		<main data-testid="styling-sx-all-props">
			{/* flat CSS properties */}
			<div
				data-testid="sx-flat"
				sx={{
					backgroundColor: "rgb(240, 240, 240)",
					color: "rgb(10, 10, 10)",
					fontSize: "16px",
					fontWeight: "600",
					padding: "12px",
				}}
			>
				flat props
			</div>

			{/* pseudo-selector */}
			<div
				data-testid="sx-pseudo"
				sx={{
					"&:focus-visible": { outline: "2px solid rgb(0, 80, 200)" },
					color: "rgb(30, 30, 30)",
					padding: "8px",
				}}
				tabIndex={0}
			>
				focus-visible pseudo
			</div>

			{/* @media — always matches min-width:1px so assertion is stable */}
			<div
				data-testid="sx-media"
				sx={{
					"@media (min-width: 1px)": { color: "rgb(0, 150, 0)" },
					color: "rgb(150, 0, 0)",
				}}
			>
				media query
			</div>

			{/* @supports — feature query always true for display:block */}
			<div
				data-testid="sx-supports"
				sx={{
					"@supports (display: block)": { color: "rgb(0, 0, 180)" },
					color: "rgb(180, 0, 0)",
				}}
			>
				supports query
			</div>

			{/* variants — data-size attr controls which variant class activates */}
			<div
				data-size="lg"
				data-testid="sx-variants-all"
				sx={{
					color: "rgb(50, 50, 50)",
					variants: {
						size: {
							lg: { color: "rgb(0, 100, 200)" },
							sm: { color: "rgb(100, 0, 0)" },
						},
					},
				}}
			>
				variants (size=lg)
			</div>

			{/* CSS custom vars via sx dynamic — the var flows through style= */}
			<div
				data-testid="sx-vars"
				sx={{ borderLeft: "4px solid rgb(200, 100, 0)", paddingLeft: "8px" }}
			>
				vars / border
			</div>
		</main>
	)
})
