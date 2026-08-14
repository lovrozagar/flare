import type { ServerFn } from "flare/server-fn"

function stub(name: string): ServerFn<unknown, unknown> {
	return Object.assign(
		(_input: unknown): Promise<unknown> => {
			throw new Error(`stub: ${name} should not be called directly on client`)
		},
		{
			_registration: {
				authenticate: false,
				fn: () => {
					throw new Error(`stub: ${name}`)
				},
				id: name,
				method: "post" as const,
				name,
			},
		},
	)
}

export const formContactFn = stub("form-contact")
export const formUploadFn = stub("form-upload")
