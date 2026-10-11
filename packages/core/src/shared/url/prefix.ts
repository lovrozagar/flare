export function hasPrefix(prefix: string, path: string): boolean {
	return path.toLowerCase().startsWith(`${prefix.toLowerCase()}/`);
}
