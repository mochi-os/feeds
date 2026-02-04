import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Switch,
  type ViewMode,
} from '@mochi/common'

interface OptionsMenuProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function OptionsMenu({ viewMode, onViewModeChange }: OptionsMenuProps) {
  const isCompact = viewMode === 'compact'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onViewModeChange(isCompact ? 'card' : 'compact')
          }}
        >
          <div className="flex items-center justify-between w-full gap-4">
            <span>Compact view</span>
            <Switch
              checked={isCompact}
              onCheckedChange={(checked) => onViewModeChange(checked ? 'compact' : 'card')}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
