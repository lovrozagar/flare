export type LoaderTasks = {
	validate: () => void;
	authenticate: () => void;
	preloader: () => void;
	authorize: () => void;
	loader: () => void;
	head: () => void;
	headers: () => void;
};

export function runLoaders(tasks: LoaderTasks): void {
	tasks.validate();
	tasks.authenticate();
	tasks.preloader();
	tasks.authorize();
	tasks.loader();
	tasks.head();
	tasks.headers();
}
