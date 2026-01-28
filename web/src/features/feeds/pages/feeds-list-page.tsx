import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Main,
  Card,
  CardContent,
  Button,
  usePageTitle,
  EmptyState,
  Skeleton,
  PageHeader,
  SortSelector,
  type SortType,
  ViewSelector,
  type ViewMode,
} from '@mochi/common'
import { Plus, Rss, Search } from 'lucide-react'
import type { Feed, FeedPost } from '@/types'
import {
  useCommentActions,
  useFeedPosts,
  useFeeds,
  useFeedsWebsocket,
  usePostActions,
  useSubscription,
} from '@/hooks'
import { setLastFeed } from '@/hooks/use-feeds-storage'
import { useSidebarContext } from '@/context/sidebar-context'
import { FeedPosts } from '../components/feed-posts'

import { RecommendedFeeds } from '../components/recommended-feeds'
import { usePostHandlers } from '../hooks'
import feedsApi from '@/api/feeds'
import endpoints from '@/api/endpoints'
import { useFeedsStore } from '@/stores/feeds-store'
import { useLocalStorage } from '@/hooks/use-local-storage'

interface FeedsListPageProps {
  feeds?: Feed[]
}

export function FeedsListPage({ feeds: _initialFeeds }: FeedsListPageProps) {
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [permissionsByFeed, setPermissionsByFeed] = useState<
    Record<string, any>
  >({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sort, setSort] = useState<SortType>('new')
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>(
    'feeds-view-mode',
    'card'
  )
  const loadedThisSession = useRef<Set<string>>(new Set())

  const refreshSidebar = useFeedsStore((state) => state.refresh)
  const storeFeeds = useFeedsStore((state) => state.feeds)

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    refreshFeedsFromApi,
    mountedRef,
    userId,
  } = useFeeds({
    onPostsLoaded: setPostsByFeed,
    sort,
  })

  const handleSubscribe = async (feedId: string) => {
    await feedsApi.subscribe(feedId)
    await refreshSidebar()
    await refreshFeedsFromApi()
  }

  // When store feeds change (e.g., subscribe from layout's search dialog),
  // refresh local feeds so posts load for newly subscribed feeds
  const prevStoreFeedCount = useRef(0)
  useEffect(() => {
    if (prevStoreFeedCount.current > 0 && storeFeeds.length !== prevStoreFeedCount.current) {
      void refreshFeedsFromApi()
    }
    prevStoreFeedCount.current = storeFeeds.length
  }, [storeFeeds.length, refreshFeedsFromApi])

  const { loadPostsForFeed } = useFeedPosts({
    setErrorMessage,
    postsByFeed,
    setPostsByFeed,
    permissionsByFeed,
    setPermissionsByFeed,
  })

  useSubscription({
    feeds,
    setFeeds,
    setErrorMessage,
    refreshFeedsFromApi,
    mountedRef,
  })

  const { postRefreshHandler, openCreateFeedDialog, openSearchDialog } = useSidebarContext()
  useEffect(() => {
    postRefreshHandler.current = (feedId: string) => {
      const cacheKey = `${feedId}:${sort}`
      loadedThisSession.current.delete(cacheKey)
      void loadPostsForFeed(feedId, { forceRefresh: true, sort })
    }
    return () => {
      postRefreshHandler.current = null
    }
  }, [postRefreshHandler, loadPostsForFeed, sort])

  usePageTitle('Feeds')

  // Store that we're on "All Feeds" view for restoration on next entry
  useEffect(() => {
    setLastFeed(null)
  }, [])

  const subscribedFeeds = useMemo(
    () => feeds.filter((feed) => feed.isSubscribed || feed.isOwner),
    [feeds]
  )

  // Get fingerprints for WebSocket subscriptions
  const feedFingerprints = useMemo(
    () =>
      subscribedFeeds
        .map((feed) => feed.fingerprint)
        .filter(Boolean) as string[],
    [subscribedFeeds]
  )



  // Connect to WebSockets for all subscribed feeds for real-time updates
  useFeedsWebsocket(feedFingerprints, userId)

  const ownedFeeds = useMemo(
    () => feeds.filter((feed) => Boolean(feed.isOwner)),
    [feeds]
  )

  const allPosts = useMemo(() => {
    const posts: FeedPost[] = []
    for (const feed of subscribedFeeds) {
      const feedPosts = postsByFeed[feed.id] ?? []
      const feedPermissions = permissionsByFeed[feed.id]
      posts.push(
        ...feedPosts.map((post) => ({
          ...post,
          isOwner: feed.isOwner,
          permissions: feedPermissions,
        }))
      )
    }

    // If we're using "new" sort, we can still sort in frontend to handle real-time updates
    // For other sorts, we trust the backend order from initial load
    if (sort === 'new') {
      return posts.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        if (isNaN(dateA) && isNaN(dateB)) return 0
        if (isNaN(dateA)) return 1
        if (isNaN(dateB)) return -1
        return dateB - dateA
      })
    }

    // For "top" and "hot", we re-sort on frontend to ensure global order is preserved
    // across merged feeds (since initial grouping destroys it)
    if (sort === 'top') {
      return posts.sort((a, b) => {
        const scoreA = (a.up ?? 0) - (a.down ?? 0)
        const scoreB = (b.up ?? 0) - (b.down ?? 0)
        return scoreB - scoreA
      })
    }

    // For "hot" / "best" / "rising", we also defer to a score-based sort if available,
    // otherwise we might lose global "hotness". Since we don't have the exact gravity score,
    // we use net score as a proxy for sorting merged lists, or rely on date for ties.
    // Ideally, "Hot" should come from backend as a single list, but untangling useFeeds is larger scope.
    if (sort === 'hot' || sort === 'best' || sort === 'rising') {
      return posts.sort((a, b) => {
        // Proxy: High score + Recent
        const scoreA = (a.up ?? 0) - (a.down ?? 0)
        const scoreB = (b.up ?? 0) - (b.down ?? 0)
        // If significant score difference, respect score
        if (Math.abs(scoreA - scoreB) > 2) return scoreB - scoreA
        // Otherwise respect date
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return dateB - dateA
      })
    }

    // For other sorts, maintain the order from the API (which is grouped by feed currently)
    return posts
  }, [subscribedFeeds, postsByFeed, permissionsByFeed, sort])

  const { handlePostReaction } = usePostActions({
    selectedFeed: null,
    ownedFeeds,
    setFeeds,
    setSelectedFeedId: () => { },
    setPostsByFeed,
    loadPostsForFeed,
    loadedFeedsRef: loadedThisSession,
    refreshFeedsFromApi,
  })

  const { handleAddComment, handleReplyToComment, handleCommentReaction } =
    useCommentActions({
      setFeeds,
      setPostsByFeed,
      loadedFeedsRef: loadedThisSession,
      commentDrafts,
      setCommentDrafts,
    })

  // Use the shared post handlers hook
  const { handleEditPost, handleDeletePost, handleEditComment, handleDeleteComment } =
    usePostHandlers({
      onRefresh: loadPostsForFeed,
    })

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  useEffect(() => {
    for (const feed of subscribedFeeds) {
      // Include sort in the cache key so we re-fetch when sort changes
      const cacheKey = `${feed.id}:${sort}`
      if (!loadedThisSession.current.has(cacheKey)) {
        loadedThisSession.current.add(cacheKey)
        void loadPostsForFeed(feed.id, { sort })
      }
    }
  }, [subscribedFeeds, loadPostsForFeed, sort])

  return (
    <>
      <PageHeader
        title="Feeds"
        icon={<Rss className='size-4 md:size-5' />}
      />
      <Main>
        {errorMessage && (
          <Card className='border-destructive/30 bg-destructive/5 shadow-none'>
            <CardContent className='text-destructive p-4 text-sm'>
              {errorMessage}
            </CardContent>
          </Card>
        )}

        <div className='flex flex-col gap-4'>
          {/* Header row with sort and view controls - always visible if we have any feeds */}
          {subscribedFeeds.length > 0 && (
            <div className='flex items-center justify-end gap-2'>
              <SortSelector value={sort} onValueChange={setSort} />
              <ViewSelector value={viewMode} onValueChange={setViewMode} />
            </div>
          )}

          {isLoadingFeeds ? (
            <div className='flex flex-col gap-4'>
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className='overflow-hidden'>
                  <CardContent className='p-4 sm:p-6'>
                    <div className='flex gap-3 sm:gap-4'>
                      <Skeleton className='size-10 shrink-0 rounded-full' />
                      <div className='flex-1 space-y-2'>
                        <div className='flex items-center justify-between'>
                          <Skeleton className='h-4 w-24' />
                          <Skeleton className='h-4 w-12' />
                        </div>
                        <Skeleton className='h-4 w-3/4' />
                        <div className='space-y-1 pt-2'>
                          <Skeleton className='h-3 w-full' />
                          <Skeleton className='h-3 w-5/6' />
                        </div>
                        <div className='flex gap-2 pt-2'>
                          <Skeleton className='h-8 w-16 rounded-full' />
                          <Skeleton className='h-8 w-16 rounded-full' />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className='space-y-6'>
              {subscribedFeeds.length === 0 ? (
                <div className='flex flex-col gap-12 max-w-4xl mx-auto w-full pt-8'>
                  <div className="text-center space-y-6">
                    <div className="space-y-2">
                      <div className="mx-auto bg-muted/30 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                        <Rss className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h2 className="text-2xl font-semibold tracking-tight">No feeds yet</h2>
                      <p className="text-muted-foreground max-w-md mx-auto">
                        Search for feeds to subscribe to, or create your own to get started.
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-4">
                      <Button onClick={openCreateFeedDialog} className="rounded-full">
                        <Plus className='size-5' />
                        Create feed
                      </Button>

                      <Button
                        variant="outline"
                        onClick={openSearchDialog}
                        className="rounded-full text-muted-foreground hover:text-foreground shadow-sm"
                      >
                        <Search className='size-4' />
                        Find feeds
                      </Button>
                    </div>
                  </div>

                  <RecommendedFeeds onSubscribe={() => void refreshFeedsFromApi()} />
                </div>
              ) : allPosts.length === 0 ? (
                <div className='py-12'>
                  <EmptyState
                    icon={Rss}
                    title='No posts yet'
                    description={
                      sort === 'new'
                        ? "Your subscribed feeds don't have any posts yet."
                        : `No posts found with ${sort} sorting.`
                    }
                  />
                </div>
              ) : (
                <FeedPosts
                  posts={allPosts}
                  sort={sort}
                  onSortChange={setSort}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  commentDrafts={commentDrafts}
                  onDraftChange={(postId: string, value: string) =>
                    setCommentDrafts((prev) => ({ ...prev, [postId]: value }))
                  }
                  onAddComment={handleAddComment}
                  onReplyToComment={handleReplyToComment}
                  onPostReaction={handlePostReaction}
                  onCommentReaction={handleCommentReaction}
                  onEditPost={handleEditPost}
                  onDeletePost={handleDeletePost}
                  onEditComment={handleEditComment}
                  onDeleteComment={handleDeleteComment}
                  showFeedName
                />
              )}
            </div>
          )}
        </div>
      </Main>


    </>
  )
}
