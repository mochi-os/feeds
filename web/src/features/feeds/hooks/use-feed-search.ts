// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { requestHelpers, toastAction, getErrorMessage, useDebounce } from '@mochi/web'
import endpoints from '@/api/endpoints'
import { feedsApi } from '@/api/feeds'
import type { DirectoryEntry } from '@/types'

const toDirectoryEntries = (value: unknown): DirectoryEntry[] =>
  Array.isArray(value) ? (value as DirectoryEntry[]) : []

export function useFeedSearch() {
  const { t } = useLingui()
  const [search, setSearch] = useState('')
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<DirectoryEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debouncedSearch = useDebounce(search, 500)

  // Search for feeds in directory
  useEffect(() => {
    if (!debouncedSearch || !searchDialogOpen) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    requestHelpers
      .get<unknown>(
        endpoints.feeds.search +
          `?search=${encodeURIComponent(debouncedSearch)}`
      )
      .then((response) => {
        setSearchResults(toDirectoryEntries(response))
      })
      .catch(() => {
        setSearchResults([])
      })
      .finally(() => {
        setIsSearching(false)
      })
  }, [debouncedSearch, searchDialogOpen])

  // Clear search when dialog closes
  useEffect(() => {
    if (!searchDialogOpen) {
      setSearch('')
      setSearchResults([])
    }
  }, [searchDialogOpen])

  const handleSubscribe = async (feedId: string, location?: string) => {
    try {
      await toastAction(feedsApi.subscribe(feedId, location), {
        loading: t`Subscribing...`,
        success: t`Subscribed to feed`,
        error: (e) => getErrorMessage(e, t`Failed to subscribe`),
      })
      const response = await requestHelpers.get<unknown>(
        endpoints.feeds.search +
          `?search=${encodeURIComponent(debouncedSearch)}`
      )
      setSearchResults(toDirectoryEntries(response))
    } catch {
      // toast already shown
    }
  }

  return {
    search,
    setSearch,
    searchDialogOpen,
    setSearchDialogOpen,
    searchResults,
    isSearching,
    handleSubscribe,
  }
}
