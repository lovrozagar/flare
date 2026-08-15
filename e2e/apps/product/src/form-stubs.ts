import type { ServerFn } from "@lovrozagar/flare/server-fn";

function stub(name: string): ServerFn<unknown, unknown> {
	return Object.assign(
		(_input: unknown): Promise<unknown> => {
			throw new Error(`stub: ${name} should not be called directly on client`);
		},
		{
			_registration: {
				authenticate: false,
				fn: () => {
					throw new Error(`stub: ${name}`);
				},
				id: name,
				method: "post" as const,
				name,
			},
		},
	);
}

export const formContactFn = stub("form-contact");
export const formUploadFn = stub("form-upload");
export const formMultiFn = stub("form-multi");
export const formDualAFn = stub("form-dual-a");
export const formDualBFn = stub("form-dual-b");
export const formAuthFn = stub("form-auth");
