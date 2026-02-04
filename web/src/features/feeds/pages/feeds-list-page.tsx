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
  type ViewMode,
} from '@mochi/common'
import { Plus, Rss } from 'lucide-react'
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
import { OptionsMenu } from '@/components/options-menu'
import { FeedPosts } from '../components/feed-posts'

import { RecommendedFeeds } from '../components/recommended-feeds'
import { InlineFeedSearch } from '../components/inline-feed-search'
import { usePostHandlers } from '../hooks'
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
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>(
    'feeds-view-mode',
    'card'
  )
  const loadedThisSession = useRef<Set<string>>(new Set())

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
  })

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

  const { postRefreshHandler, openCreateFeedDialog } = useSidebarContext()
  useEffect(() => {
    postRefreshHandler.current = (feedId: string) => {
      const cacheKey = `${feedId}:new`
      loadedThisSession.current.delete(cacheKey)
      void loadPostsForFeed(feedId, { forceRefresh: true })
    }
    return () => {
      postRefreshHandler.current = null
    }
  }, [postRefreshHandler, loadPostsForFeed])

  usePageTitle('Feeds')

  // Store that we're on "All Feeds" view for restoration on next entry
  useEffect(() => {
    setLastFeed(null)
  }, [])

  const subscribedFeeds = useMemo(
    () => feeds.filter((feed) => feed.isSubscribed || feed.isOwner),
    [feeds]
  )

  // Set of subscribed feed IDs for inline search
  const subscribedFeedIds = useMemo(
    () => new Set(subscribedFeeds.flatMap((f) => [f.id, f.fingerprint].filter((x): x is string => !!x))),
    [subscribedFeeds]
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

    // Sort by date (newest first)
    return posts.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      if (isNaN(dateA) && isNaN(dateB)) return 0
      if (isNaN(dateA)) return 1
      if (isNaN(dateB)) return -1
      return dateB - dateA
    })
  }, [subscribedFeeds, postsByFeed, permissionsByFeed])

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
      const cacheKey = `${feed.id}:new`
      if (!loadedThisSession.current.has(cacheKey)) {
        loadedThisSession.current.add(cacheKey)
        void loadPostsForFeed(feed.id)
      }
    }
  }, [subscribedFeeds, loadPostsForFeed])

  return (
    <>
      <PageHeader
        title="Feeds"
        icon={<Rss className='size-4 md:size-5' />}
        actions={<OptionsMenu viewMode={viewMode} onViewModeChange={setViewMode} />}
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
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <Rss className="text-muted-foreground mx-auto mb-3 h-10 w-10 opacity-50" />
                  <p className="text-muted-foreground mb-1 text-sm font-medium">Feeds</p>
                  <p className="text-muted-foreground mb-4 max-w-sm text-xs">
                    You have no feeds yet.
                  </p>
                  <InlineFeedSearch subscribedIds={subscribedFeedIds} onRefresh={() => void refreshFeedsFromApi()} />
                  <Button variant="outline" onClick={openCreateFeedDialog} className="mt-4">
                    <Plus className="mr-2 h-4 w-4" />
                    Create a new feed
                  </Button>
                  <RecommendedFeeds subscribedIds={subscribedFeedIds} onSubscribe={() => void refreshFeedsFromApi()} />
                </div>
              ) : allPosts.length === 0 ? (
                <div className='py-12'>
                  <EmptyState
                    icon={Rss}
                    title='No posts yet'
                  />
                </div>
              ) : (
                <FeedPosts
                  posts={allPosts}
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
