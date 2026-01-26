import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Main,
  Card,
  CardContent,
  Button,
  usePageTitle,
  EmptyState,
  Skeleton,
  SearchEntityDialog,
  PageHeader,
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
import { usePostHandlers } from '../hooks'
import feedsApi from '@/api/feeds'
import endpoints from '@/api/endpoints'

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
  const loadedThisSession = useRef<Set<string>>(new Set())

  const handleSubscribe = async (feedId: string) => {
    await feedsApi.subscribe(feedId)
  }

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

  const { postRefreshHandler, searchDialogOpen, openSearchDialog, closeSearchDialog, openCreateFeedDialog } = useSidebarContext()
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

  // Set of subscribed feed IDs for search dialog
  const subscribedFeedIds = useMemo(
    () => new Set(subscribedFeeds.flatMap((f) => [f.id, f.fingerprint].filter((x): x is string => !!x))),
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
        searchBar={
          <Button 
            variant='outline' 
            className='w-full justify-start'
            onClick={openSearchDialog}
          >
            <Search className='mr-2 size-4' />
            Search feeds
          </Button>
        }
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
        ) : subscribedFeeds.length === 0 ? (
          <EmptyState
            icon={Rss}
            title="No feeds yet"
            description="Subscribe to feeds to see posts here, or create your own."
          >
            <Button onClick={openCreateFeedDialog}>
              <Plus className='mr-2 size-4' />
              New feed
            </Button>
          </EmptyState>
        ) : allPosts.length === 0 ? (
          <EmptyState
            icon={Rss}
            title="No posts yet"
            description="Your subscribed feeds don't have any posts yet."
          />
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

      {/* Search Dialog */}
      <SearchEntityDialog
        open={searchDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeSearchDialog()
        }}
        onSubscribe={handleSubscribe}
        subscribedIds={subscribedFeedIds}
        entityClass="feed"
        searchEndpoint={`/feeds/${endpoints.feeds.search}`}
        icon={Rss}
        iconClassName="bg-orange-500/10 text-orange-600"
        title="Search feeds"
        description="Search for public feeds to subscribe to"
        placeholder="Search by name, ID, fingerprint, or URL..."
        emptyMessage="No feeds found"
      />
    </>
  )
}
