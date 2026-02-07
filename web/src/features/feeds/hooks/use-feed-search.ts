import { useEffect, useState } from 'react'
import { requestHelpers, toast, getErrorMessage } from '@mochi/common'
import endpoints from '@/api/endpoints'
import feedsApi from '@/api/feeds'
import { useDebounce } from '@/hooks/use-debounce'

export function useFeedSearch() {
  const [search, setSearch] = useState('')
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
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
      .get<any[]>(
        endpoints.feeds.search +
          `?search=${encodeURIComponent(debouncedSearch)}`
      )
      .then((response) => {
        const results = Array.isArray(response) ? response : []
        setSearchResults(results)
      })
      .catch((error) => {
        console.error('[useFeedSearch] Search failed', error)
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
      toast.success('Subscribed to feed')
      // Refresh search results
      const response = await requestHelpers.get<any[]>(
        endpoints.feeds.search +
          `?search=${encodeURIComponent(debouncedSearch)}`
      )
      setSearchResults(Array.isArray(response) ? response : [])
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to subscribe'))
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
