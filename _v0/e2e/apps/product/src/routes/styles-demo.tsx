import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";

export const route = createPage("_root_/styles-demo")
	.loader(() => ({ styled: true }))
	.render(() => {
		const boxProps = styles("styled-box", {
			css: "background: #f0f0f0; color: #333; padding: 20px; font-size: 24px;",
		});
		const smProps = styles("styled-sm", {
			css: "font-size: 14px; color: #666;",
		});
		return (
			<main data-testid="styles-demo">
				<div {...boxProps} data-testid="styled-box">
					Styled Content
				</div>
				<div {...smProps} data-testid="styled-sm">
					Small Styled
				</div>
				<p data-testid="has-data-c">{boxProps["data-c"] ? "true" : "false"}</p>
			</main>
		);
	});
