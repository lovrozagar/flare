import { Progress } from "flare-ui/progress"

export default function ProgressRoute() {
  return (
    <div class="p-8 space-y-4 max-w-sm">
      <Progress value={40} />
      <Progress value={75} />
    </div>
  )
}
