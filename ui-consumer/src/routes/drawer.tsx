import { Drawer, DrawerTrigger, DrawerContent, DrawerHandle, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "flare-ui/drawer"
import { Button } from "flare-ui/button"

export default function DrawerRoute() {
  return (
    <Drawer>
      <DrawerTrigger render={(props) => <Button data-variant="outline" {...props}>Open drawer</Button>} />
      <DrawerContent>
        <DrawerHandle />
        <DrawerHeader>
          <DrawerTitle>Drawer title</DrawerTitle>
          <DrawerDescription>Drag to dismiss.</DrawerDescription>
        </DrawerHeader>
        <p class="p-4">Drawer content here.</p>
        <DrawerFooter>
          <Button>Submit</Button>
          <DrawerClose render={(props) => <Button data-variant="outline" {...props}>Cancel</Button>} />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
