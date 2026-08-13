import { createEffect } from "solid-js"
import { Route, Router, useSearchParams } from "@solidjs/router"
import { DirectionProvider } from "@solidports/base-ui/direction-provider"
import ButtonRoute from "./routes/button.tsx"
import BadgeRoute from "./routes/badge.tsx"
import LabelRoute from "./routes/label.tsx"
import SeparatorRoute from "./routes/separator.tsx"
import SkeletonRoute from "./routes/skeleton.tsx"
import SpinnerRoute from "./routes/spinner.tsx"
import AvatarRoute from "./routes/avatar.tsx"
import AlertRoute from "./routes/alert.tsx"
import CardRoute from "./routes/card.tsx"
import InputRoute from "./routes/input.tsx"
import TextareaRoute from "./routes/textarea.tsx"
import CheckboxRoute from "./routes/checkbox.tsx"
import RadioGroupRoute from "./routes/radio-group.tsx"
import SwitchRoute from "./routes/switch.tsx"
import ToggleRoute from "./routes/toggle.tsx"
import ToggleGroupRoute from "./routes/toggle-group.tsx"
import MeterRoute from "./routes/meter.tsx"
import DialogRoute from "./routes/dialog.tsx"
import AlertDialogRoute from "./routes/alert-dialog.tsx"
import SheetRoute from "./routes/sheet.tsx"
import DrawerRoute from "./routes/drawer.tsx"
import PopoverRoute from "./routes/popover.tsx"
import TooltipRoute from "./routes/tooltip.tsx"
import HoverCardRoute from "./routes/hover-card.tsx"
import DropdownMenuRoute from "./routes/dropdown-menu.tsx"
import ContextMenuRoute from "./routes/context-menu.tsx"
import MenubarRoute from "./routes/menubar.tsx"
import NavigationMenuRoute from "./routes/navigation-menu.tsx"
import AccordionRoute from "./routes/accordion.tsx"
import CollapsibleRoute from "./routes/collapsible.tsx"
import TabsRoute from "./routes/tabs.tsx"
import ScrollAreaRoute from "./routes/scroll-area.tsx"
import ProgressRoute from "./routes/progress.tsx"
import SliderRoute from "./routes/slider.tsx"
import ComboboxRoute from "./routes/combobox.tsx"
import SelectRoute from "./routes/select.tsx"
import AutocompleteRoute from "./routes/autocomplete.tsx"
import NumberFieldRoute from "./routes/number-field.tsx"
import OTPFieldRoute from "./routes/otp-field.tsx"
import ToastRoute from "./routes/toast.tsx"
import FormRoute from "./routes/form.tsx"
import FieldRoute from "./routes/field.tsx"

function ThemeWrapper(props: { children: any }) {
  const [params] = useSearchParams()
  createEffect(() => {
    if (params.theme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  })
  return (
    <DirectionProvider direction={params.dir === "rtl" ? "rtl" : "ltr"}>
      {props.children}
    </DirectionProvider>
  )
}

export function App() {
  return (
    <Router base="/">
      <ThemeWrapper>
        <Route path="/button" component={ButtonRoute} />
        <Route path="/badge" component={BadgeRoute} />
        <Route path="/label" component={LabelRoute} />
        <Route path="/separator" component={SeparatorRoute} />
        <Route path="/skeleton" component={SkeletonRoute} />
        <Route path="/spinner" component={SpinnerRoute} />
        <Route path="/avatar" component={AvatarRoute} />
        <Route path="/alert" component={AlertRoute} />
        <Route path="/card" component={CardRoute} />
        <Route path="/input" component={InputRoute} />
        <Route path="/textarea" component={TextareaRoute} />
        <Route path="/checkbox" component={CheckboxRoute} />
        <Route path="/radio-group" component={RadioGroupRoute} />
        <Route path="/switch" component={SwitchRoute} />
        <Route path="/toggle" component={ToggleRoute} />
        <Route path="/toggle-group" component={ToggleGroupRoute} />
        <Route path="/meter" component={MeterRoute} />
        <Route path="/dialog" component={DialogRoute} />
        <Route path="/alert-dialog" component={AlertDialogRoute} />
        <Route path="/sheet" component={SheetRoute} />
        <Route path="/drawer" component={DrawerRoute} />
        <Route path="/popover" component={PopoverRoute} />
        <Route path="/tooltip" component={TooltipRoute} />
        <Route path="/hover-card" component={HoverCardRoute} />
        <Route path="/dropdown-menu" component={DropdownMenuRoute} />
        <Route path="/context-menu" component={ContextMenuRoute} />
        <Route path="/menubar" component={MenubarRoute} />
        <Route path="/navigation-menu" component={NavigationMenuRoute} />
        <Route path="/accordion" component={AccordionRoute} />
        <Route path="/collapsible" component={CollapsibleRoute} />
        <Route path="/tabs" component={TabsRoute} />
        <Route path="/scroll-area" component={ScrollAreaRoute} />
        <Route path="/progress" component={ProgressRoute} />
        <Route path="/slider" component={SliderRoute} />
        <Route path="/combobox" component={ComboboxRoute} />
        <Route path="/select" component={SelectRoute} />
        <Route path="/autocomplete" component={AutocompleteRoute} />
        <Route path="/number-field" component={NumberFieldRoute} />
        <Route path="/otp-field" component={OTPFieldRoute} />
        <Route path="/toast" component={ToastRoute} />
        <Route path="/form" component={FormRoute} />
        <Route path="/field" component={FieldRoute} />
      </ThemeWrapper>
    </Router>
  )
}
