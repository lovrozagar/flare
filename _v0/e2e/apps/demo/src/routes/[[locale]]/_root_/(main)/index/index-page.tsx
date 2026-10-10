import { createPage } from "@lovrozagar/flare/page";
import { useRouter } from "@lovrozagar/flare/router";
import { translations } from "../../../../../i18n/translations";

export const route = createPage("[[locale]]/_root_/(main)/")
	.loader(async (ctx) => {
		const t = await translations.load(ctx.locale(), ["common"]);
		return { t };
	})
	.head((ctx) => ({
		title: ctx.loaderData.t.common["site.title"],
	}))
	.render(() => {
		const t = useRouter().useLoaderT({ from: "[[locale]]/_root_/(main)/" });
		return (
			<main>
				<h1 data-testid="welcome-title">{t("common.welcome.title")}</h1>
				<p data-testid="welcome-subtitle">{t("common.welcome.subtitle")}</p>
				<p data-testid="welcome-greeting">{t("common.welcome.greeting", { name: "Flare" })}</p>
				<p data-testid="welcome-items">{t("common.welcome.items", { count: 3 })}</p>
			</main>
		);
	});

function NestedComponentExample() {
	const t = useRouter().useLoaderT({ from: "[[locale]]/_root_/(main)/" });

	t("common.welcome.greeting", { name: "Flare" });

	return (
		<main>
			<h1 data-testid="welcome-title">{t("common.welcome.title")}</h1>
			<p data-testid="welcome-subtitle">{t("common.welcome.subtitle")}</p>
			<p data-testid="welcome-greeting">{t("common.welcome.greeting", { name: "Flare" })}</p>
			<p data-testid="welcome-items">{t("common.welcome.items", { count: 3 })}</p>
		</main>
	);
}
