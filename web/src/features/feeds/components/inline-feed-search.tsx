import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Search, Loader2, Rss } from 'lucide-react'
import { Button, Input, toast, getErrorMessage } from '@mochi/common'
import feedsApi from '@/api/feeds'
import type { DirectoryEntry } from '@/types'

interface InlineFeedSearchProps {
  subscribedIds: Set<string>
  onRefresh?: () => void
}

export function InlineFeedSearch({ subscribedIds, onRefresh }: InlineFeedSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<DirectoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [pendingFeedId, setPendingFeedId] = useState<string | null>(null)
  const navigate = useNavigate()

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length === 0) {
      setResults([])
      return
    }

    const search = async () => {
      setIsLoading(true)
      try {
        const response = await feedsApi.search({ search: debouncedQuery })
        setResults(response.data ?? [])
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }

    void search()
  }, [debouncedQuery])

  const handleSubscribe = async (feed: DirectoryEntry) => {
    setPendingFeedId(feed.id)
    try {
      await feedsApi.subscribe(feed.id)
      onRefresh?.()
      void navigate({ to: '/$feedId', params: { feedId: feed.id } })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to subscribe'))
      setPendingFeedId(null)
    }
  }

  const showResults = debouncedQuery.length > 0
  const showLoading = isLoading && debouncedQuery.length > 0

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search for feeds..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 pl-9"
          autoFocus
        />
      </div>

      {/* Results */}
      {showLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      )}

      {!isLoading && showResults && results.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-4">
          No feeds found
        </p>
      )}

      {!isLoading && results.length > 0 && (
        <div className="divide-border divide-y rounded-lg border">
          {results
            .filter((feed) => !subscribedIds.has(feed.id) && !(feed.fingerprint && subscribedIds.has(feed.fingerprint)))
            .map((feed) => {
              const isPending = pendingFeedId === feed.id

              return (
                <div
                  key={feed.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-500/10">
                      <Rss className="h-4 w-4 text-orange-600" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col text-left">
                      <span className="truncate text-sm font-medium">{feed.name}</span>
                      {feed.fingerprint && (
                        <span className="text-muted-foreground truncate text-xs">
                          {feed.fingerprint.match(/.{1,3}/g)?.join('-')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSubscribe(feed)}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Subscribe'
                    )}
                  </Button>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
