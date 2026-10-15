// A promise with its settle functions. `Promise.withResolvers` is Chrome 119, Firefox 121, and Safari 17.4, above the
// client's browser floor (decision B123), so client code makes its own. The executor runs at once, inside the
// constructor, so both are assigned before the return.
export function resolvers<T>(): PromiseWithResolvers<T> {
	let resolve!: PromiseWithResolvers<T>["resolve"];
	let reject!: PromiseWithResolvers<T>["reject"];
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
