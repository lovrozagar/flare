export type Classified = {
	kind?: "document";
	status?: 404 | 400;
};

export function classify(input: { path: string; router?: () => void }): Classified {
	void input.router;
	if (input.path.startsWith("/_flare/fn/")) return { status: 404 };
	if (earlyMode(input.path)) return { status: 400 };
	return { kind: "document" };
}

function earlyMode(path: string): boolean {
	const query = path.split("?")[1] ?? "";
	const mode = new URLSearchParams(query).get("_flare");
	return mode === "data" || mode === "prefetch";
}
