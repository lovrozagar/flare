import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "flare-ui/sheet"
import { Button } from "flare-ui/button"

export default function SheetRoute() {
  return (
    <div class="flex gap-4">
      <Sheet>
        <SheetTrigger render={(props) => <Button data-variant="outline" {...props}>Open right</Button>} />
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Adjust your preferences.</SheetDescription>
          </SheetHeader>
          <p class="py-4">Sheet content here.</p>
        </SheetContent>
      </Sheet>
      <Sheet>
        <SheetTrigger render={(props) => <Button data-variant="outline" {...props}>Open bottom</Button>} />
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <p class="py-4">Filter options here.</p>
        </SheetContent>
      </Sheet>
    </div>
  )
}
