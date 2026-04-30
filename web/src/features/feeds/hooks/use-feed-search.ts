import { useEffect, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { requestHelpers, toast, getErrorMessage, useDebounce } from '@mochi/web'
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

  const handleSubscribe = async (feedId: string) => {
    try {
      await feedsApi.subscribe(feedId)
      toast.success(t`Subscribed to feed`)
      // Refresh search results
      const response = await requestHelpers.get<unknown>(
        endpoints.feeds.search +
          `?search=${encodeURIComponent(debouncedSearch)}`
      )
      setSearchResults(toDirectoryEntries(response))
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to subscribe`))
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
