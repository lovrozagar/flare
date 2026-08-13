import { ToastProvider, ToastPortal, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from "flare-ui/toast"

export default function ToastRoute() {
  return (
    <ToastProvider>
      <p class="text-sm text-muted-fg">Toast provider active. Use createToaster to spawn toasts.</p>
      <ToastPortal>
        <ToastViewport />
      </ToastPortal>
    </ToastProvider>
  )
}
