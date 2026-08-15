import { createSignal, onCleanup } from "solid-js";

export interface ServiceWorkerState {
	update: () => void;
	updateAvailable: () => boolean;
}

export function useServiceWorker(): ServiceWorkerState {
	const [updateAvailable, setUpdateAvailable] = createSignal(false);
	let waitingWorker: ServiceWorker | null = null;

	if ("serviceWorker" in navigator) {
		const sw = navigator.serviceWorker;
		const trackedListeners: Array<{
			handler: () => void;
			name: string;
			target: { removeEventListener: (name: string, handler: () => void) => void };
		}> = [];

		const onControllerChange = () => {
			window.location.reload();
		};

		sw.addEventListener("controllerchange", onControllerChange);

		onCleanup(() => {
			sw.removeEventListener("controllerchange", onControllerChange);
			for (const entry of trackedListeners) {
				entry.target.removeEventListener(entry.name, entry.handler);
			}
		});

		sw.ready.then((registration) => {
			const checkWaiting = (worker: ServiceWorker | null) => {
				if (!worker) return;
				if (worker.state === "installed") {
					waitingWorker = worker;
					setUpdateAvailable(true);
					return;
				}
				const handler = () => {
					if (worker.state === "installed") {
						waitingWorker = worker;
						setUpdateAvailable(true);
					}
				};
				worker.addEventListener("statechange", handler);
				trackedListeners.push({ handler, name: "statechange", target: worker });
			};

			checkWaiting(registration.waiting);
			checkWaiting(registration.installing);

			const onUpdateFound = () => {
				checkWaiting(registration.installing);
			};
			registration.addEventListener("updatefound", onUpdateFound);
			trackedListeners.push({ handler: onUpdateFound, name: "updatefound", target: registration });
		});
	}

	return {
		update() {
			if (waitingWorker) {
				waitingWorker.postMessage({ type: "SKIP_WAITING" });
			}
		},
		updateAvailable,
	};
}
