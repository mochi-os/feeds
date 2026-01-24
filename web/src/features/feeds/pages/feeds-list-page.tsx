import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Main,
  Card,
  CardContent,
  Button,
  usePageTitle,
  toast,
} from '@mochi/common'
import { Loader2, Plus, Rss } from 'lucide-react'
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
import { PageHeader } from '@mochi/common'
import { usePostHandlers } from '../hooks'
import feedsApi, { type RecommendedFeed } from '@/api/feeds'
import { InlineFeedSearch } from '../components/inline-feed-search'
import { useFeedsStore } from '@/stores/feeds-store'

interface FeedsListPageProps {
  feeds?: Feed[]
}

export function FeedsListPage({ feeds: _initialFeeds }: FeedsListPageProps) {
  const navigate = useNavigate()
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [permissionsByFeed, setPermissionsByFeed] = useState<
    Record<string, any>
  >({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const loadedThisSession = useRef<Set<string>>(new Set())

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
      loadedThisSession.current.delete(feedId)
      void loadPostsForFeed(feedId, true)
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

  // Get fingerprints for WebSocket subscriptions
  const feedFingerprints = useMemo(
    () =>
      subscribedFeeds
        .map((feed) => feed.fingerprint)
        .filter(Boolean) as string[],
    [subscribedFeeds]
  )

  // Set of subscribed feed IDs for inline search
  const subscribedFeedIds = useMemo(
    () => new Set(feeds.flatMap((f) => [f.id, f.fingerprint].filter((x): x is string => !!x))),
    [feeds]
  )

  // Recommendations query
  const {
    data: recommendationsData,
    isLoading: isLoadingRecommendations,
    isError: isRecommendationsError,
  } = useQuery({
    queryKey: ['feeds', 'recommendations'],
    queryFn: () => feedsApi.recommendations(),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const recommendations = recommendationsData?.data?.feeds ?? []

  const [pendingFeedId, setPendingFeedId] = useState<string | null>(null)
  const refreshStore = useFeedsStore((state) => state.refresh)

  const handleSubscribeRecommendation = async (feed: RecommendedFeed) => {
    setPendingFeedId(feed.id)
    try {
      await feedsApi.subscribe(feed.id)
      void refreshFeedsFromApi()
      void refreshStore()
      void navigate({ to: '/$feedId', params: { feedId: feed.id } })
    } catch (error) {
      toast.error('Failed to subscribe', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setPendingFeedId(null)
    }
  }


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
    setSelectedFeedId: () => {},
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
      if (!loadedThisSession.current.has(feed.id)) {
        loadedThisSession.current.add(feed.id)
        void loadPostsForFeed(feed.id)
      }
    }
  }, [subscribedFeeds, loadPostsForFeed])

  return (
    <>
      <PageHeader
        title="All feeds"
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

        {isLoadingFeeds ? (
          <div className='flex items-center justify-center py-12'>
            <Loader2 className='text-muted-foreground size-6 animate-spin' />
          </div>
        ) : subscribedFeeds.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Rss className="text-muted-foreground mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="text-muted-foreground mb-1 text-sm font-medium">Feeds</p>
            <p className="text-muted-foreground mb-4 max-w-sm text-xs">
              You have no feeds yet.
            </p>
            <InlineFeedSearch subscribedIds={subscribedFeedIds} onRefresh={() => { void refreshFeedsFromApi(); void refreshStore() }} />
            <Button variant="outline" onClick={openCreateFeedDialog} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create a new feed
            </Button>

            {/* Recommendations Section */}
            {!isRecommendationsError && recommendations.filter((rec) => !subscribedFeedIds.has(rec.id)).length > 0 && (
              <>
                <hr className="my-6 w-full max-w-md border-t" />
                <div className="w-full max-w-md">
                  <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
                    Recommended feeds
                  </p>
                  <div className="divide-border divide-y rounded-lg border text-left">
                    {recommendations
                      .filter((rec) => !subscribedFeedIds.has(rec.id))
                      .map((rec) => {
                        const isPending = pendingFeedId === rec.id

                        return (
                          <div
                            key={rec.id}
                            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-500/10">
                                <Rss className="h-4 w-4 text-orange-600" />
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-medium">{rec.name}</span>
                                {rec.blurb && (
                                  <span className="text-muted-foreground truncate text-xs">
                                    {rec.blurb}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleSubscribeRecommendation(rec)}
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
                </div>
              </>
            )}
          </div>
        ) : allPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Rss className="text-muted-foreground mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="text-muted-foreground mb-1 text-sm font-medium">No posts yet</p>
            <p className="text-muted-foreground max-w-sm text-xs">
              Your subscribed feeds don't have any posts yet.
            </p>
          </div>
        ) : (
          <FeedPosts
            posts={allPosts}
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
      </Main>
    </>
  )
}
