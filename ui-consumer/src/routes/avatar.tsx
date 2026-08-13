import { Avatar, AvatarImage, AvatarFallback } from "flare-ui/avatar"

export default function AvatarRoute() {
  return (
    <div class="flex gap-4">
      <Avatar>
        <AvatarImage src="https://github.com/shadcn.png" alt="shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    </div>
  )
}
