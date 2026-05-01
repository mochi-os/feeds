import { LogOut, MoreHorizontal, Rss, Settings } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  toast,
  getErrorMessage,
  getAppPath,
  shellClipboardWrite,
} from '@mochi/web'
import { feedsApi } from '@/api/feeds'

interface OptionsMenuProps {
  entityId?: string
  showRss?: boolean
  onSettings?: () => void
  onUnsubscribe?: () => void
  isUnsubscribing?: boolean
}

export function OptionsMenu({ entityId, showRss, onSettings, onUnsubscribe, isUnsubscribing }: OptionsMenuProps) {
  const rssEntity = entityId || (showRss ? '*' : null)

  const handleCopyRssUrl = async (mode: 'posts' | 'all') => {
    if (!rssEntity) return
    try {
      const { token } = await feedsApi.getRssToken(rssEntity, mode)
      const url = rssEntity === '*'
        ? `${window.location.origin}${getAppPath()}/-/rss?token=${token}`
        : `${window.location.origin}${getAppPath()}/${rssEntity}/-/rss?token=${token}`
      const ok = await shellClipboardWrite(url)
      if (ok) toast.success("RSS URL copied to clipboard")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to get RSS token"))
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
        {rssEntity && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Rss className="mr-2 size-4" />
                <Trans>RSS feed</Trans>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => void handleCopyRssUrl('posts')}>
                  <Trans>Posts</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleCopyRssUrl('all')}>
                  <Trans>Posts and comments</Trans>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
        )}
        {onUnsubscribe && (
          <DropdownMenuItem
            onSelect={onUnsubscribe}
            disabled={isUnsubscribing}
          >
            <LogOut className="size-4" />
            {isUnsubscribing ? "Unsubscribing..." : "Unsubscribe"}
          </DropdownMenuItem>
        )}
        {onSettings && (
          <DropdownMenuItem onSelect={onSettings}>
            <Settings className="size-4" />
            <Trans>Settings</Trans>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
