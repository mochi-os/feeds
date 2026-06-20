// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useState } from 'react'
import { Bookmark } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { toast } from '@mochi/web'
import type { FeedPost } from '@/types'
import { isSaved, onSavedChange, toggleSaved } from '@/lib/saved'

interface SavedButtonProps {
  post: FeedPost
}

/**
 * Bookmark toggle for the post action row. Reads/writes the client-side saved
 * mirror (see lib/saved) and re-renders when it changes, so the filled/empty
 * state stays in sync across every card showing the same post.
 */
export function SavedButton({ post }: SavedButtonProps) {
  const { t } = useLingui()
  const [active, setActive] = useState(false)

  useEffect(() => {
    setActive(isSaved(post.id))
    return onSavedChange(() => setActive(isSaved(post.id)))
  }, [post.id])

  return (
    <button
      type='button'
      aria-label={active ? t`Remove from saved` : t`Save for later`}
      aria-pressed={active}
      title={active ? t`Remove from saved` : t`Save for later`}
      className='text-muted-foreground hover:text-foreground -m-1 inline-flex items-center gap-1 p-1 transition-colors'
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const nowSaved = toggleSaved(post)
        toast.success(nowSaved ? t`Saved` : t`Removed from saved`)
      }}
    >
      <Bookmark
        className={`size-4 ${active ? 'fill-current text-foreground' : ''}`}
      />
    </button>
  )
}
