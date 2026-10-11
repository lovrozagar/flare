export type SegmentCache = { cdn: { maxAge: string } };

export type SegmentRecord = {
	id: string;
	cache: SegmentCache;
	render: (children: unknown) => unknown;
};

export type SegmentBuilder = {
	id: string;
	render: (children: unknown) => unknown;
	cache: (config: SegmentCache) => SegmentRecord;
};

export function createPathSegment(id: string): SegmentBuilder {
	const render = (children: unknown): unknown => children;
	return {
		id,
		render,
		cache(config: SegmentCache): SegmentRecord {
			return { id, cache: config, render };
		},
	};
}
