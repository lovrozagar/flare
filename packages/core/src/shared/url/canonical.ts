export type CanonicalOptions = {
	trailingSlash?: "preserve" | "never" | "always";
	caseSensitive?: boolean;
	basePath?: string;
};

export type CanonicalPath = { path: string } | { hostile: true };

export function canonicalPath(path: string, options: CanonicalOptions = {}): CanonicalPath {
	if (isHostile(path)) return { hostile: true };
	const collapsed = collapse(path);
	if (typeof collapsed !== "string") return collapsed;
	let next = options.caseSensitive === true ? collapsed : collapsed.toLowerCase();
	if (options.trailingSlash === "never" && next.length > 1 && next.endsWith("/")) next = next.slice(0, -1);
	return { path: next };
}

function isHostile(path: string): boolean {
	if (hasControl(path)) return true;
	if (path.includes("\\")) return true;
	if (path.startsWith("//")) return true;
	return path.toLowerCase().includes("%2f");
}

function hasControl(path: string): boolean {
	for (let index = 0; index < path.length; index++) {
		if (path.charCodeAt(index) < 0x20) return true;
	}
	return false;
}

function collapse(path: string): string | { hostile: true } {
	const trailing = path.endsWith("/") && path.length > 1;
	const out: string[] = [];
	for (const segment of path.split("/")) {
		if (segment === "") continue;
		if (segment.toLowerCase() === "%2e%2e") return { hostile: true };
		if (segment === "..") {
			out.pop();
			continue;
		}
		out.push(segment);
	}
	const next = `/${out.join("/")}`;
	return trailing ? `${next}/` : next;
}
