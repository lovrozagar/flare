import { createPage } from "flare/page"
import { styles } from "flare/styles"
import { createSignal, For, Show } from "solid-js"

export const route = createPage("_root_/styling-dynamic").render(() => {
	const showProps = styles("show-box", {
		css: "padding: 12px; color: rgb(0, 100, 200); font-weight: bold;",
	})

	const [visible, setVisible] = createSignal(false)
	const [items, setItems] = createSignal([
		{ color: "rgb(255, 0, 0)", id: 1 },
		{ color: "rgb(0, 128, 0)", id: 2 },
		{ color: "rgb(0, 0, 255)", id: 3 },
	])
	const [dynamicColor, setDynamicColor] = createSignal("rgb(128, 0, 128)")

	const dynamicProps = styles("dynamic-color-box", {
		css: (_s, v) => `padding: 12px; color: ${v.fg};`,
		vars: { fg: "rgb(128, 0, 128)" },
	})

	return (
		<main data-testid="styling-dynamic">
			<button data-testid="toggle-show" onClick={() => setVisible((prev) => !prev)} type="button">
				Toggle Show
			</button>
			<button
				data-testid="add-item"
				onClick={() =>
					setItems((prev) => [...prev, { color: "rgb(255, 165, 0)", id: prev.length + 1 }])
				}
				type="button"
			>
				Add Item
			</button>
			<button
				data-testid="remove-item"
				onClick={() => setItems((prev) => prev.slice(0, -1))}
				type="button"
			>
				Remove Item
			</button>
			<button
				data-testid="change-color"
				onClick={() =>
					setDynamicColor((prev) =>
						prev === "rgb(128, 0, 128)" ? "rgb(255, 165, 0)" : "rgb(128, 0, 128)",
					)
				}
				type="button"
			>
				Change Color
			</button>

			<Show when={visible()}>
				<div {...showProps} data-testid="show-box">
					Conditionally Visible
				</div>
			</Show>

			<div data-testid="for-list">
				<For each={items()}>
					{(item) => {
						const itemProps = styles(`for-item-${item.id}`, {
							css: `color: ${item.color}; padding: 4px;`,
						})
						return (
							<div {...itemProps} data-testid={`for-item-${item.id}`}>
								Item {item.id}
							</div>
						)
					}}
				</For>
			</div>

			<div {...dynamicProps} data-testid="dynamic-color-box" style={{ color: dynamicColor() }}>
				Dynamic Color
			</div>
		</main>
	)
})
