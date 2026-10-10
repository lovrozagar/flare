import { createSignal, For } from "solid-js";

interface TabsProps {
	tabs: string[];
}

/* Headless + styled tabs — active state via data-active attr */
export function SxTabs(props: TabsProps) {
	const [active, setActive] = createSignal(0);

	return (
		<div data-testid="sx-tabs-root">
			<div
				sx={{
					borderBottom: "2px solid rgb(220, 220, 220)",
					display: "flex",
					gap: "0",
				}}
			>
				<For each={props.tabs}>
					{(tab, i) => (
						<button
							data-active={i() === active() ? "true" : undefined}
							data-testid={`sx-tab-${i()}`}
							onClick={() => setActive(i())}
							sx={{
								"&[data-active]": {
									borderBottom: "2px solid rgb(0, 80, 200)",
									color: "rgb(0, 80, 200)",
								},
								background: "transparent",
								border: "none",
								color: "rgb(100, 100, 100)",
								cursor: "pointer",
								padding: "8px 16px",
							}}
							type="button"
						>
							{tab}
						</button>
					)}
				</For>
			</div>
			<div data-testid="sx-tab-panel" sx={{ padding: "16px" }}>
				{props.tabs[active()]}
			</div>
		</div>
	);
}
