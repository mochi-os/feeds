import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Header,
  LoadMoreTrigger,
  Main,
  useAuthStore,
  usePageTitle,
  type PostData,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  toast,
  SubscribeDialog,
  requestHelpers,
} from '@mochi/common'
import {
  useCommentActions,
  useFeedWebsocket,
  useFeeds,
  useInfinitePosts,
  useSubscription,
} from '@/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import feedsApi from '@/api/feeds'
import { mapFeedsToSummaries } from '@/api/adapters'
import type { Feed, FeedPost, FeedSummary, ReactionId } from '@/types'
import { FeedPosts } from '@/features/feeds/components/feed-posts'
import { useFeedsStore } from '@/stores/feeds-store'
import { useSidebarContext } from '@/context/sidebar-context'
import { Loader2, Rss, Settings, SquarePen, UserMinus } from 'lucide-react'

interface SubscriptionCheckResponse {
  exists: boolean
}

export const Route = createFileRoute('/_authenticated/$feedId')({
  component: FeedPage,
})

function FeedPage() {
  const { feedId } = Route.useParams()
  const navigate = useNavigate()
  const email = useAuthStore((state) => state.email)
  const isLoggedIn = !!email
  // Get feed info from cache (populated by search results)
  const getCachedFeed = useFeedsStore((state) => state.getCachedFeed)
  const refreshSidebar = useFeedsStore((state) => state.refresh)
  const cachedFeed = getCachedFeed(feedId)

  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [remoteFeed, setRemoteFeed] = useState<FeedSummary | null>(cachedFeed ?? null)
  const [isLoadingRemote, setIsLoadingRemote] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [showUnsubscribeDialog, setShowUnsubscribeDialog] = useState(false)
  const [remoteUserId, setRemoteUserId] = useState<string>()
  const fetchedRemoteRef = useRef<string | null>(null)
  const [subscribeOpen, setSubscribeOpen] = useState(false)

  // Check if user already has a subscription for feeds notifications
  const { data: subscriptionData, refetch: refetchSubscription } = useQuery({
    queryKey: ['subscription-check', 'feeds'],
    queryFn: async () => {
      return await requestHelpers.get<SubscriptionCheckResponse>(
        '/feeds/-/notifications/check'
      )
    },
    staleTime: Infinity,
  })

  // Memoize the subscribe success callback to prevent infinite loops
  // (inline functions cause useSubscription's toggleSubscription to recreate each render)
  const onSubscribeSuccess = useCallback(() => {
    // Prompt for notifications if user hasn't subscribed yet
    refetchSubscription().then((result) => {
      if (!result.data?.exists) {
        setSubscribeOpen(true)
      }
    })
  }, [refetchSubscription])

  // Register with sidebar context
  const { setFeedId, setSubscription, subscribeHandler, unsubscribeHandler, openNewPostDialog } = useSidebarContext()

  const queryClient = useQueryClient()

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    refreshFeedsFromApi,
    mountedRef,
    userId,
  } = useFeeds({})

  const { toggleSubscription } = useSubscription({
    feeds,
    setFeeds,
    setErrorMessage,
    refreshFeedsFromApi,
    mountedRef,
    onSubscribeSuccess,
  })

  const localFeed = useMemo(
    () => feeds.find((feed) => feed.id === feedId || feed.fingerprint === feedId) ?? null,
    [feeds, feedId]
  )

  const selectedFeed = localFeed ?? remoteFeed

  // Check if this is a remote feed (not in local feeds list)
  const isRemoteFeed = !localFeed && !!selectedFeed

  // Use infinite scroll for posts
  const {
    posts,
    permissions: postsPermissions,
    isLoading: isLoadingPosts,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfinitePosts({
    feedId: selectedFeed?.id ?? feedId,
    server: selectedFeed?.server ?? cachedFeed?.server,
    enabled: !isLoadingFeeds && (!!localFeed || !!remoteFeed),
  })

  // Update page title when feed is loaded
  usePageTitle(selectedFeed?.name ?? 'Feed')

  // Connect to WebSocket for real-time updates
  // Prefer fingerprint if available (backend broadcasts to fingerprint)
  useFeedWebsocket(selectedFeed?.fingerprint ?? feedId, userId ?? remoteUserId)

  // Register with sidebar context for "This feed" section
  useEffect(() => {
    setFeedId(feedId)
    return () => setFeedId(null)
  }, [feedId, setFeedId])

  // Subscribe to remote feed
  const handleSubscribe = useCallback(async () => {
    if (!selectedFeed || isSubscribing) return

    setIsSubscribing(true)
    try {
      // Pass server for private feeds not in directory
      await toggleSubscription(selectedFeed.id, selectedFeed.server ?? cachedFeed?.server)
      // Update remote feed state to show as subscribed
      setRemoteFeed((prev) => prev ? { ...prev, isSubscribed: true } : null)
      // Refresh sidebar to show new feed
      void refreshSidebar()
      // Invalidate posts query to refetch
      void queryClient.invalidateQueries({ queryKey: ['posts', feedId] })
      toast.success('Subscribed to feed')
    } catch {

      toast.error('Failed to subscribe to feed')
    } finally {
      setIsSubscribing(false)
    }
  }, [selectedFeed, isSubscribing, toggleSubscription, refreshSidebar, queryClient, feedId, cachedFeed])

  const isLoading = isLoadingFeeds || isLoadingRemote || isLoadingPosts



  // No-op ref for hooks that check loaded feeds (react-query handles caching)
  const loadedFeedsRef = useRef(new Set<string>())

  // Fetch feed info from remote via P2P if not found locally
  // (posts are handled by useInfinitePosts)
  useEffect(() => {
    // Skip if we have the feed locally, or already fetched
    if (localFeed || isLoadingFeeds || fetchedRemoteRef.current === feedId) {
      return
    }

    fetchedRemoteRef.current = feedId
    setIsLoadingRemote(true)

    // Fetch feed info via unified endpoint (auto-detects local vs remote)
    // Pass server from cached feed (from probe/search results) for private feeds not in directory
    feedsApi.get(feedId, { server: cachedFeed?.server })
      .then((response) => {
        if (!mountedRef.current) return
        const feed = response.data?.feed
        const permissions = response.data?.permissions
        if (feed && 'id' in feed && feed.id) {
          const mapped = mapFeedsToSummaries([feed as Feed], new Set())
          if (mapped[0]) {
            // Preserve server and permissions from response
            setRemoteFeed({ ...mapped[0], server: cachedFeed?.server, permissions })
          }
        }
        if (response.data && 'user_id' in response.data && typeof response.data.user_id === 'string') {
          setRemoteUserId(response.data.user_id)
        }
      })
      .catch((error) => {
        // 400 means feed is local (subscribed) - useInfinitePosts will handle it
        if (error?.response?.status === 400) {
          return
        }

        // Fall back to cached feed info if available
        if (cachedFeed) {
          setRemoteFeed(cachedFeed)
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsLoadingRemote(false)
        }
      })
  }, [feedId, localFeed, cachedFeed, isLoadingFeeds, mountedRef])

  // Optimistic update helper for posts - updates react-query cache directly
  const updatePostsCache = useCallback((updater: (posts: FeedPost[]) => FeedPost[]) => {
    queryClient.setQueryData(
      ['posts', selectedFeed?.id ?? feedId, { server: selectedFeed?.server ?? cachedFeed?.server }],
      (oldData: { pages: Array<{ posts: FeedPost[]; hasMore: boolean; nextCursor?: number }> } | undefined) => {
        if (!oldData?.pages) return oldData
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({ ...page, posts: updater(page.posts) })),
        }
      }
    )
  }, [queryClient, selectedFeed, feedId, cachedFeed])

  // Wrapper that looks like setPostsByFeed but updates react-query cache
  const setPostsByFeed = useCallback((
    updaterOrValue: Record<string, FeedPost[]> | ((prev: Record<string, FeedPost[]>) => Record<string, FeedPost[]>)
  ) => {
    const feedIdToUse = selectedFeed?.id ?? feedId
    if (typeof updaterOrValue === 'function') {
      // Get current posts directly from cache to avoid stale closure data
      const cacheKey = ['posts', feedIdToUse, { server: selectedFeed?.server ?? cachedFeed?.server }]
      const cachedData = queryClient.getQueryData<{ pages: Array<{ posts: FeedPost[] }> }>(cacheKey)
      const currentPosts = cachedData?.pages?.flatMap(p => p.posts) ?? []

      const fakeState = { [feedIdToUse]: currentPosts }
      const updated = updaterOrValue(fakeState)
      const newPosts = updated[feedIdToUse]
      if (newPosts) {
        updatePostsCache(() => newPosts)
      }
    }
  }, [selectedFeed, feedId, cachedFeed, queryClient, updatePostsCache])

  // Direct post reaction handler that updates React Query cache correctly
  const handlePostReaction = useCallback((postFeedId: string, postId: string, reaction: ReactionId | '') => {
    const queryFeedId = selectedFeed?.id ?? feedId
    const server = selectedFeed?.server ?? cachedFeed?.server
    const cacheKey = ['posts', queryFeedId, { server }]

    // Update cache directly with optimistic update
    queryClient.setQueryData<{ pages: Array<{ posts: FeedPost[]; hasMore: boolean; nextCursor?: number }> }>(
      cacheKey,
      (oldData) => {
        if (!oldData?.pages) return oldData

        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            posts: page.posts.map((post) => {
              if (post.id !== postId) return post
              // Apply reaction update
              const currentReaction = post.userReaction
              const newCounts = { ...post.reactions }
              let newUserReaction: ReactionId | null = currentReaction ?? null

              if (reaction === '' || currentReaction === reaction) {
                // Remove reaction
                if (currentReaction) {
                  newCounts[currentReaction] = Math.max(0, (newCounts[currentReaction] ?? 0) - 1)
                }
                newUserReaction = null
              } else {
                // Change reaction
                if (currentReaction) {
                  newCounts[currentReaction] = Math.max(0, (newCounts[currentReaction] ?? 0) - 1)
                }
                newCounts[reaction] = (newCounts[reaction] ?? 0) + 1
                newUserReaction = reaction
              }

              return { ...post, reactions: newCounts, userReaction: newUserReaction }
            }),
          })),
        }
      }
    )

    // Call API
    void feedsApi.reactToPost(postFeedId, postId, reaction).catch(() => {

    })
  }, [selectedFeed, feedId, cachedFeed, queryClient])

  const {
    handleAddComment,
    handleReplyToComment,
    handleCommentReaction,
  } = useCommentActions({
    setFeeds,
    setPostsByFeed,

    loadedFeedsRef,
    commentDrafts,
    setCommentDrafts,
  })

  // Edit/delete handlers for posts
  const handleEditPost = useCallback(async (postFeedId: string, postId: string, body: string, data?: PostData, order?: string[], files?: File[]) => {
    try {
      // Optimistic update for body and data
      updatePostsCache((posts) => posts.map((p) => {
        if (p.id !== postId) return p
        return {
          ...p,
          body,
          data: data ?? p.data,
        }
      }))

      await feedsApi.editPost({ feed: postFeedId, post: postId, body, data, order, files })
      
      // Invalidate query to ensure consistency (especially for attachments and server-side processing)
      // This will trigger a background refetch effectively "syncing" the user's own edit fully
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
      
      toast.success('Post updated')
    } catch {
      // Revert optimistic update by refetching
      void queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast.error('Failed to edit post')
    }
  }, [updatePostsCache, queryClient])

  const handleDeletePost = useCallback(async (postFeedId: string, postId: string) => {
    try {
      await feedsApi.deletePost(postFeedId, postId)
      // Optimistically remove the post from cache (WebSocket event is skipped for self)
      updatePostsCache((posts) => posts.filter((p) => p.id !== postId))
      toast.success('Post deleted')
    } catch {

      toast.error('Failed to delete post')
    }
  }, [updatePostsCache])

  // Edit/delete handlers for comments
  const handleEditComment = useCallback(async (commentFeedId: string, postId: string, commentId: string, body: string) => {
    try {
      await feedsApi.editComment(commentFeedId, postId, commentId, body)
      // await invalidatePosts() -- Optimistic UI
      toast.success('Comment updated')
    } catch {

      toast.error('Failed to edit comment')
    }
  }, [])

  const handleDeleteComment = useCallback(async (commentFeedId: string, postId: string, commentId: string) => {
    try {
      await feedsApi.deleteComment(commentFeedId, postId, commentId)
      // await invalidatePosts() -- Optimistic UI
      toast.success('Comment deleted')
    } catch {

      toast.error('Failed to delete comment')
    }
  }, [])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  // Handle unsubscribe - must be before early returns to satisfy rules of hooks
  const handleUnsubscribe = useCallback(async () => {
    if (!selectedFeed || isSubscribing) return

    setIsSubscribing(true)
    try {
      await toggleSubscription(selectedFeed.id)
      void refreshSidebar()
      toast.success('Unsubscribed from feed')
      // Navigate to home page (all feeds) after unsubscribing
      void navigate({ to: '/' })
    } catch {

      toast.error('Failed to unsubscribe')
    } finally {
      setIsSubscribing(false)
      setShowUnsubscribeDialog(false)
    }
  }, [selectedFeed, isSubscribing, toggleSubscription, refreshSidebar, navigate])

  // Show unsubscribe for subscribed feeds user doesn't own
  const canUnsubscribe = !!(selectedFeed?.isSubscribed && !selectedFeed?.isOwner)

  // Register subscription state with sidebar context
  useEffect(() => {
    setSubscription({
      isRemote: isRemoteFeed,
      isSubscribed: !!selectedFeed?.isSubscribed,
      canUnsubscribe,
    })
    subscribeHandler.current = handleSubscribe
    unsubscribeHandler.current = handleUnsubscribe
    return () => {
      setSubscription(null)
      subscribeHandler.current = null
      unsubscribeHandler.current = null
    }
  }, [isRemoteFeed, selectedFeed?.isSubscribed, canUnsubscribe, setSubscription, subscribeHandler, unsubscribeHandler, handleSubscribe, handleUnsubscribe])

  // Prompt for notifications when entering an owned or subscribed feed
  // (only if user hasn't set up notification subscriptions yet)
  const promptedRef = useRef(false)
  useEffect(() => {
    // Only prompt once per session, and only for owned or subscribed feeds
    if (promptedRef.current) return
    if (!selectedFeed) return
    if (!selectedFeed.isOwner && !selectedFeed.isSubscribed) return
    if (subscriptionData === undefined) return // Still loading
    if (subscriptionData?.exists) return // Already has notification subscription

    promptedRef.current = true
    setSubscribeOpen(true)
  }, [selectedFeed, subscriptionData])

  if ((isLoadingFeeds || isLoadingRemote) && !selectedFeed) {
    return (
      <>
        <Header>
          <div className="flex items-center gap-2">
            <Rss className="size-5" />
            <h1 className="text-lg font-semibold">Loading feed...</h1>
          </div>
        </Header>
        <Main>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </Main>
      </>
    )
  }

  if (!selectedFeed) {
    return (
      <>
        <Header>
          <div className="flex items-center gap-2">
            <Rss className="size-5" />
            <h1 className="text-lg font-semibold">Feed not found</h1>
          </div>
        </Header>
        <Main>
          <Card>
            <CardContent className="py-12 text-center">
              <Rss className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Feed not found</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This feed may have been deleted or you don't have access to it.
              </p>
            </CardContent>
          </Card>
        </Main>
      </>
    )
  }

  return (
    <>
      <Header>
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <Rss className="size-5" />
            <h1 className="text-lg font-semibold">{selectedFeed.name}</h1>
          </div>
          {/* Action buttons - only show for logged in users */}
          {isLoggedIn && (
            <div className="flex gap-2">
              {selectedFeed?.isOwner && (
                <Button onClick={() => openNewPostDialog(feedId)}>
                  <SquarePen className="size-4" />
                  New post
                </Button>
              )}
              {canUnsubscribe && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowUnsubscribeDialog(true)}
                    disabled={isSubscribing}
                  >
                    <UserMinus className="size-4" />
                    Unsubscribe
                  </Button>
                  <AlertDialog open={showUnsubscribeDialog} onOpenChange={setShowUnsubscribeDialog}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Unsubscribe from feed?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove "{selectedFeed.name}" from your feed list. You can subscribe again later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUnsubscribe}>Unsubscribe</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              {isRemoteFeed && !selectedFeed?.isSubscribed && (
                <Button onClick={handleSubscribe} disabled={isSubscribing}>
                  {isSubscribing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Subscribing...
                    </>
                  ) : (
                    'Subscribe'
                  )}
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link to="/$feedId/settings" params={{ feedId: selectedFeed?.fingerprint ?? feedId }}>
                  <Settings className="size-4" />
                  Settings
                </Link>
              </Button>
            </div>
          )}
        </div>
      </Header>
      <Main className="space-y-4">
        {errorMessage && (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4 text-sm text-destructive">{errorMessage}</CardContent>
          </Card>
        )}

        {/* Posts section */}
        {isLoading && posts.length === 0 ? (
          <Card className="shadow-md">
            <CardContent className="p-6 text-center">
              <Loader2 className="mx-auto mb-3 size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading posts...
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <FeedPosts
              posts={posts}
              commentDrafts={commentDrafts}
              onDraftChange={(postId, value) =>
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
              isFeedOwner={selectedFeed?.isOwner ?? false}
              permissions={postsPermissions ?? selectedFeed?.permissions}
            />
            <LoadMoreTrigger
              onLoadMore={fetchNextPage}
              hasMore={hasNextPage}
              isLoading={isFetchingNextPage}
            />
          </>
        )}
      </Main>

      <SubscribeDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        app="feeds"
        subscriptions={[
          { label: 'New posts', type: 'post', defaultEnabled: true },
          { label: 'New comments', type: 'comment', defaultEnabled: true },
          { label: 'Reactions', type: 'reaction', defaultEnabled: false },
        ]}
        appBase="/feeds"
        onResult={() => refetchSubscription()}
      />
    </>
  )
}
