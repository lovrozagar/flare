import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";
import { For } from "solid-js";

export const route = createPage("_root_/(products)/products/")
	.loader(() => [
		{ id: "1", name: "Widget" },
		{ id: "2", name: "Gadget" },
		{ id: "3", name: "Doohickey" },
	])
	.render((props) => (
		<main data-testid="product-list">
			<h1>Products</h1>
			<ul>
				<For each={props.loaderData}>
					{(product) => (
						<li>
							<Link data-testid={`product-link-${product.id}`} params={{ id: product.id }} to="/products/[id]">
								{product.name}
							</Link>
						</li>
					)}
				</For>
			</ul>
		</main>
	));
