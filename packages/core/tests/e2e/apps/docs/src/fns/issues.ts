// A validator failure that names its field, so the 400 envelope carries `fieldErrors.<field>`.
export function invalid(field: string, message: string): never {
	throw Object.assign(new Error(message), { issues: [{ message, path: [field] }] })
}
