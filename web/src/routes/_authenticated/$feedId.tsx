import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Header,
  Main,
} from '@mochi/common'
import {
  useCommentActions,
  useFeedPosts,
  useFeeds,
  usePostActions,
  useSubscription,
} from '@/hooks'
import feedsApi from '@/api/feeds'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'
import type { Feed, FeedPost, FeedSummary } from '@/types'
import { FeedPosts } from '@/features/feeds/components/feed-posts'
import { NewPostDialog } from '@/features/feeds/components/new-post-dialog'
import { useFeedsStore } from '@/stores/feeds-store'
import { Bell, Loader2, MoreHorizontal, Rss, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/$feedId')({
  component: FeedPage,
})

function FeedPage() {
  const { feedId } = Route.useParams()
  const navigate = useNavigate()
  // Get feed info from cache (populated by search results)
  const getCachedFeed = useFeedsStore((state) => state.getCachedFeed)
  const refreshSidebar = useFeedsStore((state) => state.refresh)
  const cachedFeed = getCachedFeed(feedId)

  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [remoteFeed, setRemoteFeed] = useState<FeedSummary | null>(cachedFeed ?? null)
  const [isLoadingRemote, setIsLoadingRemote] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const fetchedRemoteRef = useRef<string | null>(null)

  // Merge posts from API with existing posts, preserving current feed's posts
  // (needed when unsubscribing - API won't return posts for unsubscribed feed)
  const handlePostsLoaded = useCallback((newPosts: Record<string, FeedPost[]>) => {
    setPostsByFeed((prev) => {
      // Preserve current feed's posts if they exist and aren't in new data
      const currentFeedPosts = prev[feedId]
      if (currentFeedPosts && !newPosts[feedId]) {
        return { ...newPosts, [feedId]: currentFeedPosts }
      }
      return newPosts
    })
  }, [feedId])

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    refreshFeedsFromApi,
    mountedRef,
  } = useFeeds({
    onPostsLoaded: handlePostsLoaded,
  })

  const {
    loadingFeedId,
    loadPostsForFeed,
    loadedFeedsRef,
  } = useFeedPosts({
    setErrorMessage,
    postsByFeed,
    setPostsByFeed,
  })

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

  // Subscribe to remote feed
  const handleSubscribe = useCallback(async () => {
    if (!selectedFeed || isSubscribing) return

    setIsSubscribing(true)
    try {
      await toggleSubscription(selectedFeed.id)
      // Update remote feed state to show as subscribed
      setRemoteFeed((prev) => prev ? { ...prev, isSubscribed: true } : null)
      // Refresh sidebar to show new feed
      void refreshSidebar()
      // Load posts now that we're subscribed
      loadedFeedsRef.current.delete(feedId)
      void loadPostsForFeed(feedId)
      toast.success('Subscribed!')
    } catch (error) {
      console.error('[FeedPage] Failed to subscribe', error)
      toast.error('Failed to subscribe to feed')
    } finally {
      setIsSubscribing(false)
    }
  }, [selectedFeed, isSubscribing, toggleSubscription, refreshSidebar, loadPostsForFeed, feedId, loadedFeedsRef])

  const ownedFeeds = useMemo(
    () => feeds.filter((feed) => Boolean(feed.isOwner)),
    [feeds]
  )

  const selectedFeedPosts = useMemo(() => {
    // Use selectedFeed.id if available, otherwise fall back to feedId from URL
    // This handles the case where posts are loaded but feeds list hasn't populated yet
    const feedIdToUse = selectedFeed?.id ?? feedId
    return postsByFeed[feedIdToUse] ?? []
  }, [postsByFeed, selectedFeed, feedId])

  const isLoading = isLoadingFeeds || isLoadingRemote || loadingFeedId === feedId

  // Fetch feed and posts from remote via P2P if not found locally
  useEffect(() => {
    // Skip if we have the feed locally, or already fetched
    if (localFeed || isLoadingFeeds || fetchedRemoteRef.current === feedId) {
      return
    }

    fetchedRemoteRef.current = feedId
    setIsLoadingRemote(true)

    // Use viewRemote to fetch feed info AND posts via P2P stream
    // Pass server from cached feed (from probe/search results) for private feeds not in directory
    feedsApi.viewRemote(feedId, cachedFeed?.server)
      .then((response) => {
        if (!mountedRef.current) return
        const feed = response.data?.feed
        if (feed && 'id' in feed && feed.id) {
          const mapped = mapFeedsToSummaries([feed as Feed], new Set())
          if (mapped[0]) {
            setRemoteFeed(mapped[0])
          }
        }
        // Store posts from remote feed
        const posts = response.data?.posts
        if (posts) {
          const mappedPosts = mapPosts(posts)
          setPostsByFeed((prev) => ({ ...prev, [feedId]: mappedPosts }))
        }
      })
      .catch((error) => {
        // 400 means feed is local (subscribed) - just load posts normally
        if (error?.response?.status === 400) {
          loadedFeedsRef.current.delete(feedId)
          void loadPostsForFeed(feedId)
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
  }, [feedId, localFeed, cachedFeed, isLoadingFeeds, mountedRef, setPostsByFeed, loadPostsForFeed, loadedFeedsRef])

  const {
    handleLegacyDialogPost,
    handlePostReaction,
  } = usePostActions({
    selectedFeed,
    ownedFeeds,
    setFeeds,
    setSelectedFeedId: () => {},
    setPostsByFeed,
    loadPostsForFeed,
    loadedFeedsRef,
    refreshFeedsFromApi,
    isRemoteFeed,
  })

  const {
    handleAddComment,
    handleReplyToComment,
    handleCommentReaction,
  } = useCommentActions({
    setFeeds,
    setPostsByFeed,
    loadPostsForFeed,
    loadedFeedsRef,
    commentDrafts,
    setCommentDrafts,
    isRemoteFeed,
  })

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  useEffect(() => {
    if (!feedId || loadedFeedsRef.current.has(feedId)) {
      return
    }
    const hasPosts = Boolean(postsByFeed[feedId]?.length)
    if (hasPosts) {
      loadedFeedsRef.current.add(feedId)
      return
    }
    loadedFeedsRef.current.add(feedId)
    void loadPostsForFeed(feedId)
  }, [feedId, loadPostsForFeed, postsByFeed, loadedFeedsRef])

  // Handle unsubscribe - must be before early returns to satisfy rules of hooks
  const handleUnsubscribe = useCallback(async () => {
    if (!selectedFeed || isSubscribing) return

    setIsSubscribing(true)
    try {
      await toggleSubscription(selectedFeed.id)
      // Copy feed info to remoteFeed so page can still display it after unsubscribing
      // (localFeed will become null when feeds list updates)
      setRemoteFeed({ ...selectedFeed, isSubscribed: false })
      // Mark as already fetched to prevent remote re-fetch (we already have the posts)
      fetchedRemoteRef.current = feedId
      void refreshSidebar()
    } catch (error) {
      console.error('[FeedPage] Failed to unsubscribe', error)
      toast.error('Failed to unsubscribe')
    } finally {
      setIsSubscribing(false)
    }
  }, [selectedFeed, isSubscribing, toggleSubscription, refreshSidebar, feedId])

  // Handle delete feed (owner only)
  const handleDelete = useCallback(async () => {
    if (!selectedFeed || !selectedFeed.isOwner || isDeleting) return

    setIsDeleting(true)
    try {
      await feedsApi.delete(selectedFeed.id)
      void refreshSidebar()
      toast.success('Feed deleted')
      void navigate({ to: '/' })
    } catch (error) {
      console.error('[FeedPage] Failed to delete feed', error)
      toast.error('Failed to delete feed')
    } finally {
      setIsDeleting(false)
    }
  }, [selectedFeed, isDeleting, refreshSidebar, navigate])

  // Show unsubscribe for subscribed feeds user doesn't own
  const canUnsubscribe = selectedFeed?.isSubscribed && !selectedFeed?.isOwner

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
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Rss className="size-5" />
            <h1 className="text-lg font-semibold">{selectedFeed.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            {isRemoteFeed && !selectedFeed.isSubscribed && (
              <Button
                size="sm"
                onClick={handleSubscribe}
                disabled={isSubscribing}
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Subscribing...
                  </>
                ) : (
                  'Subscribe'
                )}
              </Button>
            )}
            {canUnsubscribe && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnsubscribe}
                disabled={isSubscribing}
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Unsubscribing...
                  </>
                ) : (
                  'Unsubscribe'
                )}
              </Button>
            )}
            {selectedFeed.isOwner && (
              <>
                <NewPostDialog feeds={[selectedFeed]} onSubmit={handleLegacyDialogPost} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="size-4" />
                      Delete feed
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete feed?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{selectedFeed.name}" and all its posts, comments, and reactions. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      </Header>
      <Main className="space-y-6">
        {errorMessage && (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4 text-sm text-destructive">{errorMessage}</CardContent>
          </Card>
        )}

        {/* Subscribe banner for unsubscribed remote feeds - only show if no posts yet */}
        {isRemoteFeed && !selectedFeed.isSubscribed && selectedFeedPosts.length === 0 && !isLoading && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <Bell className="size-5 text-primary" />
                <p className="text-sm">
                  Subscribe to get updates from this feed in your timeline.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleSubscribe}
                disabled={isSubscribing}
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Subscribing...
                  </>
                ) : (
                  'Subscribe'
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Posts section */}
        {isLoading && selectedFeedPosts.length === 0 ? (
          <Card className="shadow-md">
            <CardContent className="p-6 text-center">
              <Loader2 className="mx-auto mb-3 size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading posts...
              </p>
            </CardContent>
          </Card>
        ) : (
          <FeedPosts
            posts={selectedFeedPosts}
            commentDrafts={commentDrafts}
            onDraftChange={(postId, value) =>
              setCommentDrafts((prev) => ({ ...prev, [postId]: value }))
            }
            onAddComment={handleAddComment}
            onReplyToComment={handleReplyToComment}
            onPostReaction={handlePostReaction}
            onCommentReaction={handleCommentReaction}
            isRemote={isRemoteFeed}
          />
        )}
      </Main>
    </>
  )
}
