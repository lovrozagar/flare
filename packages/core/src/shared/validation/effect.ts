const EFFECT_SCHEMA = Symbol.for("effect/Schema")

// A plain Effect Schema is callable but no validator: called, it fails every input, so a route or server function
// would answer 400 to everything. The server runner calls this before validating, so the request is a 500 whose error
// names the owner and the fix: in dev on the overlay and in the log. It runs on the server only, so the client bundle
// carries none of it (BUGS.md 157).
export function checkValidator(validator: object, owner: string): void {
	if (!(EFFECT_SCHEMA in validator) || "~standard" in validator) return
	throw new Error(`${owner}: a plain Effect Schema is not a validator; wrap it with Schema.standardSchemaV1(schema)`)
}
