// A validator failure that names its field, so the 400 envelope carries `fieldErrors.<field>`.
export function invalid(field: string, message: string): never {
	throw Object.assign(new Error(message), { issues: [{ message, path: [field] }] })
}

// The message of a field in a failed call, if the server named that field.
export function fieldError(error: unknown, field: string): string | undefined {
	const fields: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "fieldErrors") : undefined
	const messages: unknown = typeof fields === "object" && fields !== null ? Reflect.get(fields, field) : undefined
	return Array.isArray(messages) && typeof messages[0] === "string" ? messages[0] : undefined
}
