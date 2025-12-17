import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Header, Main, Input, Card, CardContent } from '@mochi/common'
import { useFeeds, useSubscription } from '@/hooks'
import { FeedGrid } from '@/features/feeds/components/feed-grid'
import { STRINGS } from '@/features/feeds/constants'
import { Loader2, Library, Rss, Search } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/feeds/')({
  component: BrowseFeedsPage,
})

function BrowseFeedsPage() {
  const [filterTerm, setFilterTerm] = useState('')

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
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

  const filteredFeeds = useMemo(() => {
    if (!filterTerm.trim()) {
      return feeds
    }
    const term = filterTerm.toLowerCase()
    return feeds.filter(
      (feed) =>
        feed.name.toLowerCase().includes(term) ||
        feed.description?.toLowerCase().includes(term)
    )
  }, [feeds, filterTerm])

  const hasFeeds = feeds.length > 0
  const hasFilteredFeeds = filteredFeeds.length > 0

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Library className="size-5" />
          <h1 className="text-lg font-semibold">Browse feeds</h1>
        </div>
      </Header>
      <Main className="space-y-6">
        {hasFeeds && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter feeds..."
              value={filterTerm}
              onChange={(event) => setFilterTerm(event.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {isLoadingFeeds ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Loading feeds...</p>
            </div>
          </div>
        ) : !hasFeeds ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Rss className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{STRINGS.NO_FEEDS_TITLE}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {STRINGS.NO_FEEDS_DESCRIPTION}
              </p>
            </CardContent>
          </Card>
        ) : !hasFilteredFeeds ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">No matching feeds</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different filter term.
              </p>
            </CardContent>
          </Card>
        ) : (
          <FeedGrid feeds={filteredFeeds} onToggleSubscription={toggleSubscription} />
        )}
      </Main>
    </>
  )
}
