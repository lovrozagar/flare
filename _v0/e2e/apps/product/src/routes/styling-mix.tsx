import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";

export const route = createPage("_root_/styling-mix")
	.head(() => ({
		css: "/mix-page.css",
		custom: { styles: [{ children: ".mix-custom { letter-spacing: 2px; }" }] },
	}))
	.render(() => {
		const scopedProps = styles("mix-scoped", {
			css: "margin: 8px; color: rgb(0, 0, 255);",
		});
		return (
			<main data-testid="styling-mix">
				<div class="mix-head" data-testid="mix-head">
					Head CSS
				</div>
				<div class="mix-custom" data-testid="mix-custom">
					Custom Style
				</div>
				<div {...scopedProps} data-testid="mix-scoped">
					Scoped styles()
				</div>
				<div css="font-style: italic; color: rgb(255, 0, 0);" data-testid="mix-css-native">
					Native css=
				</div>
				<div class="underline font-bold" data-testid="mix-tw-native">
					Native tw=
				</div>
			</main>
		);
	});
