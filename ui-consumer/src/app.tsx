import { For, type JSX, createSignal } from "solid-js"
import { DirectionProvider } from "@solidports/base-ui/direction-provider"
import { Button } from "flare-ui/button"
import { Switch } from "flare-ui/switch"
import AccordionRoute from "./routes/accordion.tsx"
import AlertDialogRoute from "./routes/alert-dialog.tsx"
import AlertRoute from "./routes/alert.tsx"
import AutocompleteRoute from "./routes/autocomplete.tsx"
import AvatarRoute from "./routes/avatar.tsx"
import BadgeRoute from "./routes/badge.tsx"
import ButtonRoute from "./routes/button.tsx"
import CardRoute from "./routes/card.tsx"
import CheckboxRoute from "./routes/checkbox.tsx"
import CollapsibleRoute from "./routes/collapsible.tsx"
import ComboboxRoute from "./routes/combobox.tsx"
import ContextMenuRoute from "./routes/context-menu.tsx"
import DialogRoute from "./routes/dialog.tsx"
import DrawerRoute from "./routes/drawer.tsx"
import DropdownMenuRoute from "./routes/dropdown-menu.tsx"
import FieldRoute from "./routes/field.tsx"
import FormRoute from "./routes/form.tsx"
import HoverCardRoute from "./routes/hover-card.tsx"
import InputRoute from "./routes/input.tsx"
import LabelRoute from "./routes/label.tsx"
import MenubarRoute from "./routes/menubar.tsx"
import MeterRoute from "./routes/meter.tsx"
import NavigationMenuRoute from "./routes/navigation-menu.tsx"
import NumberFieldRoute from "./routes/number-field.tsx"
import OTPFieldRoute from "./routes/otp-field.tsx"
import PopoverRoute from "./routes/popover.tsx"
import ProgressRoute from "./routes/progress.tsx"
import RadioGroupRoute from "./routes/radio-group.tsx"
import ScrollAreaRoute from "./routes/scroll-area.tsx"
import SelectRoute from "./routes/select.tsx"
import SeparatorRoute from "./routes/separator.tsx"
import SheetRoute from "./routes/sheet.tsx"
import SkeletonRoute from "./routes/skeleton.tsx"
import SliderRoute from "./routes/slider.tsx"
import SpinnerRoute from "./routes/spinner.tsx"
import SwitchRoute from "./routes/switch.tsx"
import TabsRoute from "./routes/tabs.tsx"
import TextareaRoute from "./routes/textarea.tsx"
import ToastRoute from "./routes/toast.tsx"
import ToggleGroupRoute from "./routes/toggle-group.tsx"
import ToggleRoute from "./routes/toggle.tsx"
import TooltipRoute from "./routes/tooltip.tsx"

interface Section {
	component: () => JSX.Element
	id: string
	label: string
}

const sections: ReadonlyArray<Section> = [
	{ component: AccordionRoute, id: "accordion", label: "Accordion" },
	{ component: AlertRoute, id: "alert", label: "Alert" },
	{ component: AlertDialogRoute, id: "alert-dialog", label: "Alert Dialog" },
	{ component: AutocompleteRoute, id: "autocomplete", label: "Autocomplete" },
	{ component: AvatarRoute, id: "avatar", label: "Avatar" },
	{ component: BadgeRoute, id: "badge", label: "Badge" },
	{ component: ButtonRoute, id: "button", label: "Button" },
	{ component: CardRoute, id: "card", label: "Card" },
	{ component: CheckboxRoute, id: "checkbox", label: "Checkbox" },
	{ component: CollapsibleRoute, id: "collapsible", label: "Collapsible" },
	{ component: ComboboxRoute, id: "combobox", label: "Combobox" },
	{ component: ContextMenuRoute, id: "context-menu", label: "Context Menu" },
	{ component: DialogRoute, id: "dialog", label: "Dialog" },
	{ component: DrawerRoute, id: "drawer", label: "Drawer" },
	{ component: DropdownMenuRoute, id: "dropdown-menu", label: "Dropdown Menu" },
	{ component: FieldRoute, id: "field", label: "Field" },
	{ component: FormRoute, id: "form", label: "Form" },
	{ component: HoverCardRoute, id: "hover-card", label: "Hover Card" },
	{ component: InputRoute, id: "input", label: "Input" },
	{ component: LabelRoute, id: "label", label: "Label" },
	{ component: MenubarRoute, id: "menubar", label: "Menubar" },
	{ component: MeterRoute, id: "meter", label: "Meter" },
	{ component: NavigationMenuRoute, id: "navigation-menu", label: "Navigation Menu" },
	{ component: NumberFieldRoute, id: "number-field", label: "Number Field" },
	{ component: OTPFieldRoute, id: "otp-field", label: "OTP Field" },
	{ component: PopoverRoute, id: "popover", label: "Popover" },
	{ component: ProgressRoute, id: "progress", label: "Progress" },
	{ component: RadioGroupRoute, id: "radio-group", label: "Radio Group" },
	{ component: ScrollAreaRoute, id: "scroll-area", label: "Scroll Area" },
	{ component: SelectRoute, id: "select", label: "Select" },
	{ component: SeparatorRoute, id: "separator", label: "Separator" },
	{ component: SheetRoute, id: "sheet", label: "Sheet" },
	{ component: SkeletonRoute, id: "skeleton", label: "Skeleton" },
	{ component: SliderRoute, id: "slider", label: "Slider" },
	{ component: SpinnerRoute, id: "spinner", label: "Spinner" },
	{ component: SwitchRoute, id: "switch", label: "Switch" },
	{ component: TabsRoute, id: "tabs", label: "Tabs" },
	{ component: TextareaRoute, id: "textarea", label: "Textarea" },
	{ component: ToastRoute, id: "toast", label: "Toast" },
	{ component: ToggleRoute, id: "toggle", label: "Toggle" },
	{ component: ToggleGroupRoute, id: "toggle-group", label: "Toggle Group" },
	{ component: TooltipRoute, id: "tooltip", label: "Tooltip" },
]

export function App() {
	const [dark, setDark] = createSignal(false)
	const [rtl, setRtl] = createSignal(false)

	const toggleTheme = () => {
		setDark(!dark())
		document.documentElement.classList.toggle("dark", dark())
	}

	return (
		<DirectionProvider direction={rtl() ? "rtl" : "ltr"}>
			<div class="bg-muted mx-auto grid min-h-screen max-w-[1200px] grid-cols-[14rem_minmax(0,1fr)] gap-0 border-x border-border">
				<aside class="border-border bg-background sticky top-0 flex h-screen flex-col overflow-hidden border-r">
					<div class="border-border flex flex-col gap-4 border-b p-5">
						<div>
							<div class="font-mono text-[11px] tracking-widest text-muted-fg uppercase">P1 · 42 components</div>
							<div class="text-xl font-semibold tracking-tight">flare-ui</div>
						</div>
						<div class="flex flex-col gap-2">
							<label class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors">
								<span class="text-muted-fg">Dark</span>
								<Switch checked={dark()} onCheckedChange={toggleTheme} />
							</label>
							<label class="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors">
								<span class="text-muted-fg">RTL</span>
								<Switch checked={rtl()} onCheckedChange={() => setRtl(!rtl())} />
							</label>
						</div>
					</div>
					<nav class="flex-1 overflow-y-auto p-3">
						<For each={sections}>
							{(s) => (
								<a
									href={`#${s.id}`}
									class="text-muted-fg hover:text-foreground hover:bg-accent flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors"
								>
									{s.label}
								</a>
							)}
						</For>
					</nav>
				</aside>

				<main class="min-w-0">
					<div class="space-y-16 px-10 py-14">
						<header class="space-y-3">
							<div class="text-muted-fg font-mono text-[11px] tracking-widest uppercase">flare-ui · consumer</div>
							<h1 class="text-4xl font-semibold tracking-tight">All 42 components</h1>
							<p class="text-muted-fg max-w-2xl text-base leading-relaxed">
								Single-page gallery rendered through `@repo/flare-ui` peer-dep wiring with Tailwind v4 source scan over <code class="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">node_modules/@repo/flare-ui/src</code>.
							</p>
						</header>

						<For each={sections}>
							{(s) => (
								<section id={s.id} class="scroll-mt-12 space-y-5">
									<div class="flex items-baseline justify-between gap-4">
										<div class="flex items-baseline gap-3">
											<h2 class="text-2xl font-semibold tracking-tight">{s.label}</h2>
											<a
												href={`#${s.id}`}
												class="text-muted-fg hover:text-muted-fg font-mono text-xs transition-colors"
											>
												#{s.id}
											</a>
										</div>
									</div>
									<div class="border-border bg-background overflow-hidden rounded-xl border shadow-sm">
										<div class="flex min-h-32 items-center justify-center p-10">
											<s.component />
										</div>
									</div>
								</section>
							)}
						</For>

						<footer class="border-border flex justify-center border-t pt-10">
							<Button data-variant="outline" onClick={() => window.scrollTo({ behavior: "smooth", top: 0 })}>
								Back to top
							</Button>
						</footer>
					</div>
				</main>
			</div>
		</DirectionProvider>
	)
}
