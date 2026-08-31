// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useState } from 'react'
import { Bookmark } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@mochi/web'
import type { FeedPost } from '@/types'
import { isSaved, onSavedChange, toggleSaved } from '@/lib/saved'

interface SavedButtonProps {
  post: FeedPost
  className?: string
}

export function SavedButton({ post, className }: SavedButtonProps) {
  const { t } = useLingui()
  const [active, setActive] = useState(false)

  useEffect(() => {
    setActive(isSaved(post.id))
    return onSavedChange(() => setActive(isSaved(post.id)))
  }, [post.id])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          aria-label={active ? t`Remove from saved` : t`Save for later`}
          aria-pressed={active}
          className={cn(
            'text-muted-foreground hover:text-foreground -m-1 inline-flex items-center gap-1 p-1 transition-[color,opacity]',
            // A filled bookmark is stored state and stays visible, like the
            // reaction chips; a hollow one is a transient action and reveals
            // on card hover with the rest, always shown on mobile.
            !active &&
              'md:pointer-events-none md:opacity-0 md:group-hover/card:pointer-events-auto md:group-hover/card:opacity-100 md:group-focus-within/card:pointer-events-auto md:group-focus-within/card:opacity-100',
            className
          )}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            toggleSaved(post)
          }}
        >
          <Bookmark
            className={`size-4 ${active ? 'fill-current text-foreground' : ''}`}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>{active ? t`Remove from saved` : t`Save for later`}</TooltipContent>
    </Tooltip>
  )
}
