// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect } from 'react'
import { useShellStorage } from '@mochi/web'

export type ReadFilter = 'all' | 'unread'

// The reader's choice lives in shell storage, which answers asynchronously.
// This copy of the value last shown lets a feed page opened later start with
// it, rather than with every post until storage answers, and lets the feed
// route's loader ask for the posts that page will show.
let current: ReadFilter = 'all'

/** The read filter a feed page opened now starts with. */
export function readFilter(): ReadFilter {
  return current
}

/** The reader's read filter: every post, or only those not yet read. */
export function useReadFilter(): [ReadFilter, (value: ReadFilter) => void] {
  const [filter, setFilter] = useShellStorage<ReadFilter>(
    'feeds-read-filter',
    current
  )
  useEffect(() => {
    current = filter
  }, [filter])
  return [filter, setFilter]
}
