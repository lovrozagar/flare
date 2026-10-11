const MIB = 1024 * 1024;

export type BunServer = {
	fetch: (request: Request) => Response | Promise<Response>;
	bodyLimit?: number;
};

export function createBunFetch(server: BunServer): {
	fetch: (request: Request) => Promise<Response>;
	maxRequestBodySize: number;
} {
	return {
		fetch(request) {
			return Promise.resolve(server.fetch(request));
		},
		maxRequestBodySize: server.bodyLimit === undefined ? MIB : server.bodyLimit,
	};
}
