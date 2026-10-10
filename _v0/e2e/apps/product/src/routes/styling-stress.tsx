import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";
import { createSignal, For } from "solid-js";

export const route = createPage("_root_/styling-stress").render(() => {
	/* many unique styles() calls to stress the registry */
	const boxes = Array.from({ length: 20 }, (_, i) => {
		const hue = (i * 18) % 360;
		return {
			id: i,
			props: styles(`stress-box-${i}`, {
				css: `color: hsl(${hue}, 70%, 50%); padding: ${4 + i}px;`,
			}),
		};
	});

	/* cross-property collision: all set "color" but with different values */
	const collisionA = styles("collision-a", {
		css: "color: rgb(255, 0, 0); margin: 4px;",
	});
	const collisionB = styles("collision-b", {
		css: "color: rgb(0, 255, 0); margin: 4px;",
	});
	const collisionC = styles("collision-c", {
		css: "color: rgb(0, 0, 255); margin: 4px;",
	});

	/* dynamic list that creates styles() on mount */
	const [dynamicCount, setDynamicCount] = createSignal(3);
	const dynamicItems = () =>
		Array.from({ length: dynamicCount() }, (_, i) => ({
			color: `rgb(${(i * 80) % 256}, ${(i * 50 + 100) % 256}, ${(i * 30 + 50) % 256})`,
			id: `dyn-${i}`,
		}));

	/* native css= and tw= mixed on same page as styles() */
	const mixedScoped = styles("stress-mixed-scoped", {
		css: "font-size: 20px; color: rgb(100, 0, 100);",
	});

	return (
		<main data-testid="styling-stress">
			<section data-testid="mass-boxes">
				<For each={boxes}>
					{(box) => (
						<div {...box.props} data-testid={`stress-box-${box.id}`}>
							Box {box.id}
						</div>
					)}
				</For>
			</section>

			<section data-testid="collision-section">
				<div {...collisionA} data-testid="collision-a">
					A
				</div>
				<div {...collisionB} data-testid="collision-b">
					B
				</div>
				<div {...collisionC} data-testid="collision-c">
					C
				</div>
			</section>

			<button data-testid="add-dynamic" onClick={() => setDynamicCount((n) => n + 5)} type="button">
				Add 5
			</button>

			<section data-testid="dynamic-section">
				<For each={dynamicItems()}>
					{(item) => {
						const itemProps = styles(`stress-dyn-${item.id}`, {
							css: `color: ${item.color}; padding: 2px;`,
						});
						return (
							<div {...itemProps} data-testid={item.id}>
								{item.id}
							</div>
						);
					}}
				</For>
			</section>

			<section data-testid="mixed-section">
				<div {...mixedScoped} data-testid="stress-mixed-scoped">
					Scoped
				</div>
				<div css="color: rgb(0, 200, 100); font-size: 18px;" data-testid="stress-css-native">
					Native css=
				</div>
				<div class="font-bold underline" data-testid="stress-tw-native">
					Native tw=
				</div>
			</section>
		</main>
	);
});
