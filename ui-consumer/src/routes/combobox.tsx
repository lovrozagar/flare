import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemIndicator,
	ComboboxList,
	ComboboxTrigger,
} from "flare-ui/combobox"

const fruits = ["Apple", "Banana", "Cherry", "Date", "Elderberry"]

export default function ComboboxRoute() {
	return (
		<div class="p-8">
			<Combobox items={fruits}>
				<div class="flex h-9 w-full max-w-sm items-center rounded-md border border-input bg-transparent shadow-xs">
					<ComboboxInput placeholder="Search fruit..." />
					<ComboboxTrigger />
				</div>
				<ComboboxContent>
					<ComboboxList>
						{fruits.map((f) => (
							<ComboboxItem value={f}>
								<ComboboxItemIndicator />
								{f}
							</ComboboxItem>
						))}
					</ComboboxList>
					<ComboboxEmpty>No results.</ComboboxEmpty>
				</ComboboxContent>
			</Combobox>
		</div>
	)
}
