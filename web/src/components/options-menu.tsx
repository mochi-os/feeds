import { LogOut, MoreHorizontal, Rss, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Switch,
  toast,
  getErrorMessage,
  getAppPath,
  type ViewMode,
} from '@mochi/common'
import { feedsApi } from '@/api/feeds'

interface OptionsMenuProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  entityId?: string
  showRss?: boolean
  onSettings?: () => void
  onUnsubscribe?: () => void
  isUnsubscribing?: boolean
}

export function OptionsMenu({ viewMode, onViewModeChange, entityId, showRss, onSettings, onUnsubscribe, isUnsubscribing }: OptionsMenuProps) {
  const isCompact = viewMode === 'compact'
  const rssEntity = entityId || (showRss ? '*' : null)

  const handleCopyRssUrl = async (mode: 'posts' | 'all') => {
    if (!rssEntity) return
    try {
      const { token } = await feedsApi.getRssToken(rssEntity, mode)
      const url = rssEntity === '*'
        ? `${window.location.origin}${getAppPath()}/-/rss?token=${token}`
        : `${window.location.origin}${getAppPath()}/${rssEntity}/-/rss?token=${token}`
      await navigator.clipboard.writeText(url)
      toast.success('RSS URL copied to clipboard')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to get RSS token'))
    }
  }

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
        {rssEntity && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Rss className="mr-2 size-4" />
                RSS feed
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => void handleCopyRssUrl('posts')}>
                  Posts
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleCopyRssUrl('all')}>
                  Posts and comments
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        {onUnsubscribe && (
          <DropdownMenuItem
            onSelect={onUnsubscribe}
            disabled={isUnsubscribing}
          >
            <LogOut className="mr-2 size-4" />
            {isUnsubscribing ? 'Unsubscribing...' : 'Unsubscribe'}
          </DropdownMenuItem>
        )}
        {onSettings && (
          <DropdownMenuItem onSelect={onSettings}>
            <Settings className="mr-2 size-4" />
            Settings
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
