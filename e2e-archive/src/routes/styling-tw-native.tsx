import { createPage } from "flare/page"

export const route = createPage("_root_/styling-tw-native").render(() => (
	<main data-testid="styling-tw-native">
		<div class="flex gap-4 p-8" data-testid="tw-native-flex">
			TW Flex
		</div>
		<div class="text-red-500 font-bold" data-testid="tw-native-color">
			TW Color
		</div>
	</main>
))
