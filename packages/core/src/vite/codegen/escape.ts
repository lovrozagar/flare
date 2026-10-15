export function escapeSource(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}
