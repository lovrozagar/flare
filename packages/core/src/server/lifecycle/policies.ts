export function assignPolicy(document: { kind: "document" }): string {
	void document.kind;
	return "private, no-store";
}
