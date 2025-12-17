import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Header, Main, Input, Card, CardContent } from '@mochi/common'
import feedsApi from '@/api/feeds'
import type { DirectoryEntry, FeedSummary, ProbeEntry } from '@/types'
import { useFeeds, useSubscription } from '@/hooks'
import { FeedGrid } from '@/features/feeds/components/feed-grid'
import { STRINGS } from '@/features/feeds/constants'
import { Loader2, Search as SearchIcon, Rss } from 'lucide-react'

const searchSchema = z.object({
  search: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/search')({
  validateSearch: searchSchema,
  component: SearchFeedsPage,
})

const SEARCH_DEBOUNCE_MS = 500

// Check if input looks like a feed URL (contains /feeds/)
const isFeedUrl = (input: string): boolean => {
  return input.includes('/feeds/')
}

const mapDirectoryEntryToFeedSummary = (entry: DirectoryEntry): FeedSummary => ({
  // Strip 'feeds/' prefix from directory entry id
  id: entry.id.replace(/^feeds\//, ''),
  name: entry.name || 'Unnamed Feed',
  description: entry.name ? STRINGS.DIRECTORY_SUBSCRIBED_LABEL : STRINGS.DIRECTORY_SUBSCRIBED_LABEL,
  tags: [],
  owner: 'Subscribed feed',
  subscribers: 0,
  unreadPosts: 0,
  lastActive: entry.created
    ? new Date(entry.created * 1000).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : STRINGS.RECENTLY_ACTIVE,
  isSubscribed: false,
  isOwner: false,
  fingerprint: entry.fingerprint,
})

const mapProbeEntryToFeedSummary = (entry: ProbeEntry): FeedSummary => ({
  id: entry.id,
  name: entry.name || 'Remote Feed',
  description: `Remote feed on ${entry.server}`,
  tags: [],
  owner: entry.server,
  subscribers: 0,
  unreadPosts: 0,
  lastActive: STRINGS.RECENTLY_ACTIVE,
  isSubscribed: false,
  isOwner: false,
  fingerprint: entry.fingerprint,
  server: entry.server,
})

function SearchFeedsPage() {
  const { search } = Route.useSearch()
  const navigate = Route.useNavigate()

  const [searchTerm, setSearchTerm] = useState(search || '')
  const [searchResults, setSearchResults] = useState<FeedSummary[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const mountedSearchRef = useRef(true)

  const {
    feeds,
    setFeeds,
    refreshFeedsFromApi,
    mountedRef,
  } = useFeeds()

  const { toggleSubscription } = useSubscription({
    feeds,
    setFeeds,
    setErrorMessage: () => {},
    refreshFeedsFromApi,
    mountedRef,
  })

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  useEffect(() => {
    return () => {
      mountedSearchRef.current = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const performSearch = useCallback(async (term: string) => {
    const trimmedSearch = term.trim()

    if (!trimmedSearch) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      // Check if input is a URL
      if (isFeedUrl(trimmedSearch)) {
        // Probe remote feed by URL
        const response = await feedsApi.probe({ url: trimmedSearch })
        if (!mountedSearchRef.current) return

        if (response.data) {
          setSearchResults([mapProbeEntryToFeedSummary(response.data)])
        } else {
          setSearchResults([])
        }
      } else {
        // Regular search (handles name, ID, and fingerprint on backend)
        const response = await feedsApi.search({ search: trimmedSearch })
        if (!mountedSearchRef.current) return

        const mappedResults = (response.data ?? []).map(mapDirectoryEntryToFeedSummary)
        setSearchResults(mappedResults)
      }
    } catch (error) {
      console.error('[SearchFeeds] Failed to search feeds', error)
      setSearchResults([])
    } finally {
      if (mountedSearchRef.current) {
        setIsSearching(false)
      }
    }
  }, [])

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      void performSearch(searchTerm)
      void navigate({ search: { search: searchTerm || undefined }, replace: true })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchTerm, performSearch, navigate])

  useEffect(() => {
    if (searchResults.length === 0 || feeds.length === 0) {
      return
    }

    setSearchResults((current) => {
      if (current.length === 0) return current

      let hasChanges = false
      const updated = current.map((searchFeed) => {
        const updatedFeed = feeds.find((feed) => {
          const matchesId = feed.id === searchFeed.id
          const matchesFingerprint =
            feed.fingerprint &&
            searchFeed.fingerprint &&
            feed.fingerprint === searchFeed.fingerprint
          return matchesId || matchesFingerprint
        })

        if (updatedFeed) {
          if (
            searchFeed.isSubscribed !== updatedFeed.isSubscribed ||
            searchFeed.subscribers !== updatedFeed.subscribers ||
            searchFeed.isOwner !== updatedFeed.isOwner
          ) {
            hasChanges = true
            return {
              ...searchFeed,
              isSubscribed: updatedFeed.isSubscribed,
              subscribers: updatedFeed.subscribers,
              isOwner: updatedFeed.isOwner,
            }
          }
        }
        return searchFeed
      })

      return hasChanges ? updated : current
    })
  }, [feeds, searchResults])

  const hasResults = searchResults.length > 0
  const hasSearchTerm = searchTerm.trim().length > 0

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <SearchIcon className="size-5" />
          <h1 className="text-lg font-semibold">Search feeds</h1>
        </div>
      </Header>
      <Main className="space-y-6">
        <div className="relative">
          {isSearching ? (
            <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            placeholder="Feed name, ID, fingerprint, or URL..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-10"
            autoFocus
          />
        </div>

        {isSearching ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Searching...</p>
            </div>
          </div>
        ) : hasSearchTerm && !hasResults ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Rss className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">No feeds found</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search term or create a new feed.
              </p>
            </CardContent>
          </Card>
        ) : hasResults ? (
          <FeedGrid feeds={searchResults} onToggleSubscription={toggleSubscription} />
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <SearchIcon className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Search for feeds</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter a search term to find feeds across the network.
              </p>
            </CardContent>
          </Card>
        )}
      </Main>
    </>
  )
}
