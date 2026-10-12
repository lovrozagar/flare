export type Direction = "forward" | "back" | "same";

// The history index delta names the view-transition type. With transitions off there is none.
export function transitionDirection(input: { from: number; to: number; enabled: boolean }): Direction | undefined {
	if (!input.enabled) return undefined;
	if (input.to > input.from) return "forward";
	return input.to < input.from ? "back" : "same";
}
