// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { Link2, LogOut, MoreHorizontal, Rss, Settings, Share2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  getErrorMessage,
  getAppPath,
  shellClipboardWrite,
} from '@mochi/web'
import { feedsApi } from '@/api/feeds'

interface OptionsMenuProps {
  entityId?: string
  showRss?: boolean
  onSources?: () => void
  onSettings?: () => void
  onUnsubscribe?: () => void
  isUnsubscribing?: boolean
  /** Show 'Copy invite link' - owner only (the share action is owner-gated). */
  canShare?: boolean
}

export function OptionsMenu({ entityId, showRss, onSources, onSettings, onUnsubscribe, isUnsubscribing, canShare }: OptionsMenuProps) {
  const { t } = useLingui()
  const rssEntity = entityId || (showRss ? '*' : null)

  const handleCopyInviteLink = async () => {
    if (!entityId) return
    try {
      const { data: { link } } = await feedsApi.share(entityId)
      const ok = await shellClipboardWrite(link)
      if (ok) toast.success(t`Invite link copied to clipboard`)
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to create invite link`))
    }
  }

  const handleCopyRssUrl = async (mode: 'posts' | 'all') => {
    if (!rssEntity) return
    try {
      const { token } = await feedsApi.getRssToken(rssEntity, mode)
      const url = rssEntity === '*'
        ? `${window.location.origin}${getAppPath()}/-/rss?token=${token}`
        : `${window.location.origin}${getAppPath()}/${rssEntity}/-/rss?token=${token}`
      const ok = await shellClipboardWrite(url)
      if (ok) toast.success(t`RSS URL copied to clipboard`)
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to get RSS token`))
    }
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t`More options`}
              className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-hover hover:text-foreground transition-colors"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t`More options`}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {onSources && (
          <DropdownMenuItem onSelect={onSources}>
            <Link2 className="size-4" />
            <Trans>Sources</Trans>
          </DropdownMenuItem>
        )}
        {onSettings && (
          <DropdownMenuItem onSelect={onSettings}>
            <Settings className="size-4" />
            <Trans>Settings</Trans>
          </DropdownMenuItem>
        )}
        {canShare && entityId && (
          <DropdownMenuItem onSelect={() => void handleCopyInviteLink()}>
            <Share2 className="size-4" />
            <Trans>Copy invite link</Trans>
          </DropdownMenuItem>
        )}
        {rssEntity && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Rss className="me-2 size-4" />
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
            {isUnsubscribing ? <Trans>Unsubscribing...</Trans> : <Trans>Unsubscribe</Trans>}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
