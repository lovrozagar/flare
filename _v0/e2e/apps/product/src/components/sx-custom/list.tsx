import { For } from "solid-js";

/* Mapped list — each item has its own sx based on index/variant */
export function SxList(props: { items: string[] }) {
	return (
		<ul sx={{ listStyle: "none", margin: "0", padding: "0" }}>
			<For each={props.items}>
				{(item, i) => (
					<li
						data-testid={`sx-list-item-${i()}`}
						sx={{
							color: i() % 2 === 0 ? "rgb(0, 0, 180)" : "rgb(180, 0, 0)",
							padding: "4px 0",
						}}
					>
						{item}
					</li>
				)}
			</For>
		</ul>
	);
}
