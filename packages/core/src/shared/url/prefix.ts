export function hasPrefix(prefix: string, path: string, options?: { caseSensitive?: boolean }): boolean {
	const left = options?.caseSensitive === true ? prefix : prefix.toLowerCase();
	const right = options?.caseSensitive === true ? path : path.toLowerCase();
	return right.startsWith(`${left}/`);
}
