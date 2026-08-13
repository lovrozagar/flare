import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "flare-ui/dialog"
import { Button } from "flare-ui/button"

export default function DialogRoute() {
  return (
    <Dialog>
      <DialogTrigger render={(props) => <Button {...props}>Open dialog</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description goes here.</DialogDescription>
        </DialogHeader>
        <p>Dialog body content.</p>
        <DialogFooter>
          <DialogClose render={(props) => <Button data-variant="outline" {...props}>Cancel</Button>} />
          <Button>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
