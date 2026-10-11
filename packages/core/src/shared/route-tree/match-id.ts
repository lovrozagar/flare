export function matchId(params: Readonly<Record<string, string>>, search: string): string {
	const body = Object.keys(params)
		.sort()
		.map((key) => `${key}=${params[key] as string}`)
		.join("&");
	return `${body}&${search}`;
}
