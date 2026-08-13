import { createPage } from "flare/page"
import { ButtonSlot } from "../components/sx-custom/button-slot"

export const route = createPage("_root_/styling-sx-aschild").render(() => (
	<main data-testid="styling-sx-aschild">
		<section>
			<h3>default (no as)</h3>
			<ButtonSlot data-testid="btn-default">Regular button</ButtonSlot>
		</section>
		<section>
			<h3>as="a": renders as anchor</h3>
			<ButtonSlot as="a" href="/" data-testid="btn-as-link">
				Link button
			</ButtonSlot>
		</section>
		<section>
			<h3>as="a" + consumer class override</h3>
			{/* consumer class lands in user.app layer — wins over lib user.lib layer */}
			<ButtonSlot as="a" href="/" class="btn-override-red" data-testid="btn-class-override">
				Class override
			</ButtonSlot>
		</section>
		<section>
			<h3>as="a" + consumer style override</h3>
			{/* inline style is highest specificity — always wins regardless of layers */}
			<ButtonSlot
				as="a"
				href="/"
				style={{ "background-color": "rgb(200, 50, 50)" }}
				data-testid="btn-style-override"
			>
				Style override
			</ButtonSlot>
		</section>
	</main>
))
