// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Trans } from '@lingui/react/macro'
import { X } from 'lucide-react'

interface TagFilterProps {
  tag: string
  onClear: () => void
}

/** The tag a list of posts is filtered by, and the way back to the whole list. */
export function TagFilter({ tag, onClear }: TagFilterProps) {
  return (
    <div className='flex items-center gap-2'>
      <span className='text-muted-foreground text-sm'>
        <Trans>Filtered by tag:</Trans>
      </span>
      <button
        type='button'
        className='bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium'
        onClick={onClear}
      >
        {tag}
        <X className='size-3.5' />
      </button>
    </div>
  )
}
