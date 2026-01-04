import { createFileRoute, Link } from '@tanstack/react-router'
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
  getErrorMessage,
  isDomainEntityContext,
  getDomainEntityFingerprint,
  requestHelpers,
  type PostData,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mochi/common'
import {
  useCommentActions,
  useFeeds,
  useInfinitePosts,
  useSubscription,
} from '@/hooks'
import { useQueryClient } from '@tanstack/react-query'
import feedsApi from '@/api/feeds'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'
import type { Feed, FeedPermissions, FeedPost, FeedSummary, Post, ReactionId } from '@/types'
import { FeedPosts } from '@/features/feeds/components/feed-posts'
import { useFeedsStore } from '@/stores/feeds-store'
import { useSidebarContext } from '@/context/sidebar-context'
import { AlertTriangle, ArrowLeft, Globe, Loader2, Rss, Settings, SquarePen, UserMinus } from 'lucide-react'
import { toast } from '@mochi/common'

export const Route = createFileRoute('/_authenticated/$feedId')({
  component: FeedPage,
})

// Response type for single post fetch
interface PostViewResponse {
  posts?: Post[]
  permissions?: FeedPermissions
  feed?: { id: string; name: string; fingerprint?: string }
}

function FeedPage() {
  const { feedId: urlFeedId } = Route.useParams()

  // In domain entity routing, the URL param might actually be a post ID
  // Check if we're in domain entity context and adjust accordingly
  const domainFingerprint = getDomainEntityFingerprint()
  const inDomainContext = isDomainEntityContext('feed')

  // Check if the URL param looks like a post ID (UUIDv7 hex format)
  const isPostIdInUrl = inDomainContext && domainFingerprint && urlFeedId && /^[0-9a-f]{32}$/.test(urlFeedId)
  const postIdFromUrl = isPostIdInUrl ? urlFeedId : null

  // Use domain entity fingerprint if available, otherwise use URL param
  const feedId = (inDomainContext && domainFingerprint) ? domainFingerprint : urlFeedId

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
  const fetchedRemoteRef = useRef<string | null>(null)

  // Single post view state (when URL contains a post ID in domain context)
  const [singlePost, setSinglePost] = useState<FeedPost | null>(null)
  const [singlePostPermissions, setSinglePostPermissions] = useState<FeedPermissions | undefined>()
  const [singlePostFeedName, setSinglePostFeedName] = useState<string>('')
  const [isLoadingSinglePost, setIsLoadingSinglePost] = useState(false)
  const [singlePostError, setSinglePostError] = useState<string | null>(null)

  // Register with sidebar context
  const { setFeedId, setSubscription, subscribeHandler, unsubscribeHandler, openNewPostDialog } = useSidebarContext()

  const queryClient = useQueryClient()

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    refreshFeedsFromApi,
    mountedRef,
  } = useFeeds({})

  const { toggleSubscription } = useSubscription({
    feeds,
    setFeeds,
    setErrorMessage,
    refreshFeedsFromApi,
    mountedRef,
  })

  const localFeed = useMemo(
    () => feeds.find((feed) => feed.id === feedId || feed.fingerprint === feedId) ?? null,
    [feeds, feedId]
  )

  const selectedFeed = localFeed ?? remoteFeed

  // Check if this is a remote feed (not in local feeds list)
  const isRemoteFeed = !localFeed && !!selectedFeed

  // Use infinite scroll for posts (disabled when viewing single post)
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
    enabled: !isLoadingFeeds && (!!localFeed || !!remoteFeed) && !postIdFromUrl,
  })

  // Update page title when feed is loaded
  usePageTitle(postIdFromUrl ? (singlePostFeedName || 'Post') : (selectedFeed?.name ?? 'Feed'))

  // Fetch single post when URL contains a post ID
  useEffect(() => {
    if (!postIdFromUrl || !feedId) return

    setIsLoadingSinglePost(true)
    setSinglePostError(null)

    // In domain context, use relative path; otherwise use full /feeds/... path
    const apiPath = inDomainContext ? `/-/posts?post=${postIdFromUrl}` : `/feeds/${feedId}/-/posts?post=${postIdFromUrl}`
    requestHelpers
      .get<PostViewResponse>(apiPath)
      .then((response) => {
        if (response?.posts && response.posts.length > 0) {
          const mapped = mapPosts(response.posts)
          setSinglePost(mapped[0] ?? null)
          setSinglePostPermissions(response.permissions)
          if (response.feed?.name) {
            setSinglePostFeedName(response.feed.name)
          }
        } else {
          setSinglePostError('Post not found')
        }
      })
      .catch((err) => {
        console.error('[FeedPage] Failed to load single post', err)
        const message = err instanceof Error ? err.message : 'Failed to load post'
        setSinglePostError(message)
      })
      .finally(() => {
        setIsLoadingSinglePost(false)
      })
  }, [feedId, postIdFromUrl])

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
    } catch (error) {
      console.error('[FeedPage] Failed to subscribe', error)
      toast.error(getErrorMessage(error, 'Failed to subscribe to feed'))
    } finally {
      setIsSubscribing(false)
    }
  }, [selectedFeed, isSubscribing, toggleSubscription, refreshSidebar, queryClient, feedId, cachedFeed])

  const isLoading = isLoadingFeeds || isLoadingRemote || isLoadingPosts

  // Wrapper for hooks that still use the old API
  // After any action, we invalidate the query to refetch from server
  const invalidatePosts = useCallback(async () => {
    // Use same feed ID as the query to ensure cache invalidation matches
    const queryFeedId = selectedFeed?.id ?? feedId
    await queryClient.invalidateQueries({ queryKey: ['posts', queryFeedId] })
  }, [queryClient, feedId, selectedFeed])

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
      })
      .catch((error) => {
        // 400 means feed is local (subscribed) - useInfinitePosts will handle it
        if (error?.response?.status === 400) {
          return
        }
        console.error('[FeedPage] Failed to fetch remote feed', error)
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
          pages: oldData.pages.map((page, i) =>
            i === 0 ? { ...page, posts: updater(page.posts) } : page
          ),
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
    void feedsApi.reactToPost(postFeedId, postId, reaction).catch((error) => {
      console.error('[FeedPage] Failed to react to post', error)
    })
  }, [selectedFeed, feedId, cachedFeed, queryClient])

  const {
    handleAddComment,
    handleReplyToComment,
    handleCommentReaction,
  } = useCommentActions({
    setFeeds,
    setPostsByFeed,
    loadPostsForFeed: invalidatePosts as any,
    loadedFeedsRef,
    commentDrafts,
    setCommentDrafts,
  })

  // Edit/delete handlers for posts
  const handleEditPost = useCallback(async (postFeedId: string, postId: string, body: string, data?: PostData, order?: string[], files?: File[]) => {
    try {
      await feedsApi.editPost({ feed: postFeedId, post: postId, body, data, order, files })
      await invalidatePosts()
      toast.success('Post updated')
    } catch (error) {
      console.error('[FeedPage] Failed to edit post', error)
      toast.error(getErrorMessage(error, 'Failed to edit post'))
    }
  }, [invalidatePosts])

  const handleDeletePost = useCallback(async (postFeedId: string, postId: string) => {
    try {
      await feedsApi.deletePost(postFeedId, postId)
      await invalidatePosts()
      toast.success('Post deleted')
    } catch (error) {
      console.error('[FeedPage] Failed to delete post', error)
      toast.error(getErrorMessage(error, 'Failed to delete post'))
    }
  }, [invalidatePosts])

  // Edit/delete handlers for comments
  const handleEditComment = useCallback(async (commentFeedId: string, postId: string, commentId: string, body: string) => {
    try {
      await feedsApi.editComment(commentFeedId, postId, commentId, body)
      await invalidatePosts()
      toast.success('Comment updated')
    } catch (error) {
      console.error('[FeedPage] Failed to edit comment', error)
      toast.error(getErrorMessage(error, 'Failed to edit comment'))
    }
  }, [invalidatePosts])

  const handleDeleteComment = useCallback(async (commentFeedId: string, postId: string, commentId: string) => {
    try {
      await feedsApi.deleteComment(commentFeedId, postId, commentId)
      await invalidatePosts()
      toast.success('Comment deleted')
    } catch (error) {
      console.error('[FeedPage] Failed to delete comment', error)
      toast.error(getErrorMessage(error, 'Failed to delete comment'))
    }
  }, [invalidatePosts])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  // Handle unsubscribe - must be before early returns to satisfy rules of hooks
  const handleUnsubscribe = useCallback(async () => {
    if (!selectedFeed || isSubscribing) return

    setIsSubscribing(true)
    try {
      await toggleSubscription(selectedFeed.id)
      toast.success('Unsubscribed from feed')
      void refreshSidebar()
      // Navigate to home after unsubscribing
      window.location.href = inDomainContext ? '/' : '/feeds'
    } catch (error) {
      console.error('[FeedPage] Failed to unsubscribe', error)
      toast.error(getErrorMessage(error, 'Failed to unsubscribe'))
    } finally {
      setIsSubscribing(false)
      setShowUnsubscribeDialog(false)
    }
  }, [selectedFeed, isSubscribing, toggleSubscription, refreshSidebar, feedId, inDomainContext])

  // Show unsubscribe for subscribed feeds user doesn't own
  const canUnsubscribe = !!(selectedFeed?.isSubscribed && !selectedFeed?.isOwner)

  // Refresh single post data
  const refreshSinglePost = useCallback(async () => {
    if (!postIdFromUrl || !feedId) return
    const apiPath = inDomainContext ? `/-/posts?post=${postIdFromUrl}` : `/feeds/${feedId}/-/posts?post=${postIdFromUrl}`
    const response = await requestHelpers.get<PostViewResponse>(apiPath)
    if (response?.posts && response.posts.length > 0) {
      const mapped = mapPosts(response.posts)
      setSinglePost(mapped[0] ?? null)
      setSinglePostPermissions(response.permissions)
    }
  }, [feedId, postIdFromUrl, inDomainContext])

  // Single post reaction handler
  const handleSinglePostReaction = useCallback(
    (postFeedId: string, pId: string, reaction: ReactionId | '') => {
      if (!singlePost) return

      // Optimistic update
      const currentReaction = singlePost.userReaction
      const newCounts = { ...singlePost.reactions }
      let newUserReaction: ReactionId | null = currentReaction ?? null

      if (reaction === '' || currentReaction === reaction) {
        if (currentReaction) {
          newCounts[currentReaction] = Math.max(0, (newCounts[currentReaction] ?? 0) - 1)
        }
        newUserReaction = null
      } else {
        if (currentReaction) {
          newCounts[currentReaction] = Math.max(0, (newCounts[currentReaction] ?? 0) - 1)
        }
        newCounts[reaction] = (newCounts[reaction] ?? 0) + 1
        newUserReaction = reaction
      }

      setSinglePost({ ...singlePost, reactions: newCounts, userReaction: newUserReaction })
      void feedsApi.reactToPost(postFeedId, pId, reaction)
    },
    [singlePost]
  )

  // Single post comment/edit handlers
  const handleSinglePostAddComment = useCallback(
    async (postFeedId: string, pId: string, body?: string) => {
      if (!body) return
      await feedsApi.createComment({ feed: postFeedId, post: pId, body })
      await refreshSinglePost()
      setCommentDrafts((prev) => ({ ...prev, [pId]: '' }))
    },
    [refreshSinglePost]
  )

  const handleSinglePostReplyToComment = useCallback(
    async (postFeedId: string, pId: string, parentId: string, body: string) => {
      await feedsApi.createComment({ feed: postFeedId, post: pId, body, parent: parentId })
      await refreshSinglePost()
    },
    [refreshSinglePost]
  )

  const handleSinglePostCommentReaction = useCallback(
    async (postFeedId: string, pId: string, commentId: string, reaction: string) => {
      await feedsApi.reactToComment(postFeedId, pId, commentId, reaction)
      await refreshSinglePost()
    },
    [refreshSinglePost]
  )

  const handleSinglePostEdit = useCallback(
    async (postFeedId: string, pId: string, body: string, data?: PostData, order?: string[], files?: File[]) => {
      await feedsApi.editPost({ feed: postFeedId, post: pId, body, data, order, files })
      await refreshSinglePost()
      toast.success('Post updated')
    },
    [refreshSinglePost]
  )

  const handleSinglePostDelete = useCallback(
    async (postFeedId: string, pId: string) => {
      await feedsApi.deletePost(postFeedId, pId)
      toast.success('Post deleted')
      // Navigate back to feed after deletion
      window.location.href = inDomainContext ? '/' : `/feeds/${feedId}`
    },
    [feedId, inDomainContext]
  )

  const handleSinglePostEditComment = useCallback(
    async (fId: string, pId: string, commentId: string, body: string) => {
      await feedsApi.editComment(fId, pId, commentId, body)
      await refreshSinglePost()
      toast.success('Comment updated')
    },
    [refreshSinglePost]
  )

  const handleSinglePostDeleteComment = useCallback(
    async (fId: string, pId: string, commentId: string) => {
      await feedsApi.deleteComment(fId, pId, commentId)
      await refreshSinglePost()
      toast.success('Comment deleted')
    },
    [refreshSinglePost]
  )

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

  if (!selectedFeed && !postIdFromUrl) {
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

  // Single post view (when URL contains a post ID in domain context)
  if (postIdFromUrl) {
    if (isLoadingSinglePost) {
      return (
        <Main className="space-y-4">
          <Card className="shadow-md">
            <CardContent className="p-6 text-center">
              <Loader2 className="mx-auto mb-3 size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading post...</p>
            </CardContent>
          </Card>
        </Main>
      )
    }

    if (singlePostError || !singlePost) {
      return (
        <Main className="space-y-4">
          <Card className="border-destructive/50">
            <CardContent className="py-12 text-center">
              <AlertTriangle className="mx-auto mb-4 size-12 text-destructive" />
              <h2 className="text-lg font-semibold">Post not found</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {singlePostError || 'This post may have been deleted or you may not have access to it.'}
              </p>
              <div className="mt-4">
                <Link to={inDomainContext ? '/' : '/$feedId'} params={inDomainContext ? {} : { feedId }}>
                  <Button variant="outline">
                    <ArrowLeft className="size-4" />
                    Back to feed
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </Main>
      )
    }

    return (
      <Main className="space-y-4">
        {/* Back link */}
        <div className="-mt-1">
          <Link
            to={inDomainContext ? '/' : '/$feedId'}
            params={inDomainContext ? {} : { feedId }}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            {singlePostFeedName || 'Back to feed'}
          </Link>
        </div>

        {/* Single post */}
        <FeedPosts
          posts={[singlePost]}
          commentDrafts={commentDrafts}
          onDraftChange={(pId, value) => setCommentDrafts((prev) => ({ ...prev, [pId]: value }))}
          onAddComment={handleSinglePostAddComment}
          onReplyToComment={handleSinglePostReplyToComment}
          onPostReaction={handleSinglePostReaction}
          onCommentReaction={handleSinglePostCommentReaction}
          onEditPost={handleSinglePostEdit}
          onDeletePost={handleSinglePostDelete}
          onEditComment={handleSinglePostEditComment}
          onDeleteComment={handleSinglePostDeleteComment}
          permissions={singlePostPermissions}
        />
      </Main>
    )
  }

  return (
    <>
      <Main className="space-y-4">
        {errorMessage && (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4 text-sm text-destructive">{errorMessage}</CardContent>
          </Card>
        )}

        {/* Feed header with name and subscription status */}
        {selectedFeed && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Rss className="h-5 w-5" />
              <h1 className="text-xl font-semibold">{selectedFeed.name}</h1>
              {!selectedFeed.isOwner && selectedFeed.isSubscribed && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  <Globe className="h-3 w-3" />
                  Subscribed
                </span>
              )}
            </div>
            <div className="flex-1" />
            {isLoggedIn && (
              <>
                {selectedFeed.isOwner && (
                  <Button onClick={() => openNewPostDialog(feedId)}>
                    <SquarePen className="size-4" />
                    <span className="hidden sm:inline">New post</span>
                  </Button>
                )}
                {!selectedFeed.isOwner && selectedFeed.isSubscribed && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowUnsubscribeDialog(true)}
                      disabled={isSubscribing}
                    >
                      <UserMinus className="h-4 w-4" />
                      <span className="hidden sm:inline">Unsubscribe</span>
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
                {isRemoteFeed && !selectedFeed.isSubscribed && (
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
                <Button variant="outline" size="sm" asChild>
                  <Link to="/$feedId/settings" params={{ feedId: selectedFeed.fingerprint ?? feedId }}>
                    <Settings className="size-4" />
                    <span className="hidden sm:inline">Settings</span>
                  </Link>
                </Button>
              </>
            )}
          </div>
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
    </>
  )
}
