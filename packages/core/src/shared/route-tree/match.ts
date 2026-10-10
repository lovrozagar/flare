export function matchPath(pattern: string, path: string, options: { caseSensitive?: boolean } = {}): boolean {
	const sensitive = options.caseSensitive === true;
	return segmentKey(pattern, sensitive, true) === segmentKey(path, sensitive, false);
}

function segmentKey(value: string, sensitive: boolean, encode: boolean): string {
	return value
		.split("/")
		.filter((part) => part !== "")
		.map((part) => {
			const text = encode ? encodeURIComponent(part) : part;
			return sensitive ? text : text.toLowerCase();
		})
		.join("/");
}
