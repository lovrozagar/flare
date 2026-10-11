import type { JSX } from "@solidjs/web";

export type SegmentCache = { cdn: { maxAge: string } };

export type SegmentRender = (props: { children: JSX.Element }) => JSX.Element;

export type SegmentRecord = {
	id: string;
	cache: SegmentCache;
	render: SegmentRender;
};

export type SegmentBuilder = {
	id: string;
	render: SegmentRender;
	cache: (config: SegmentCache) => SegmentRecord;
};

function render(props: { children: JSX.Element }): JSX.Element {
	return props.children;
}

export function createPathSegment(id: string): SegmentBuilder {
	return {
		id,
		render,
		cache(config: SegmentCache): SegmentRecord {
			return { id, cache: config, render };
		},
	};
}
