export const title = "Home";

export function loader(request: Request): { sentinel: string } {
	return { sentinel: request.headers.get("x-sentinel") ?? title };
}
