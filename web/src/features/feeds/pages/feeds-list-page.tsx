import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Main,
  Card,
  CardContent,
  Button,
  usePageTitle,
} from '@mochi/common'
import { Loader2, Plus, Rss, Search } from 'lucide-react'
import type { Feed, FeedPost } from '@/types'
import {
  useCommentActions,
  useFeedPosts,
  useFeeds,
  useFeedsWebsocket,
  usePostActions,
  useSubscription,
} from '@/hooks'
import { useSidebarContext } from '@/context/sidebar-context'
import { FeedPosts } from '../components/feed-posts'
import { FeedSearchDialog } from '../components/feed-search-dialog'
import { CreateFeedDialog } from '../components/create-feed-dialog'
import { PageHeader } from '../components/page-header'
import { useFeedSearch, usePostHandlers } from '../hooks'

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
  const [createFeedDialogOpen, setCreateFeedDialogOpen] = useState(false)
  const loadedThisSession = useRef<Set<string>>(new Set())

  // Feed search hook
  const {
    search,
    setSearch,
    searchDialogOpen,
    setSearchDialogOpen,
    searchResults,
    isSearching,
    handleSubscribe,
  } = useFeedSearch()

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

  const { postRefreshHandler } = useSidebarContext()
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
      // Filter feeds by search term
      if (search && !feed.name.toLowerCase().includes(search.toLowerCase())) {
        continue
      }
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
  }, [subscribedFeeds, postsByFeed, permissionsByFeed, search])

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
        actions={
          <>
            <Button variant='outline' onClick={() => setSearchDialogOpen(true)}>
              <Search className='mr-2 size-4' />
              Search
            </Button>
            <Button onClick={() => setCreateFeedDialogOpen(true)}>
              <Plus className='mr-2 size-4' />
              New feed
            </Button>
          </>
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
          <div className='flex items-center justify-center py-12'>
            <Loader2 className='text-muted-foreground size-6 animate-spin' />
          </div>
        ) : subscribedFeeds.length === 0 ? (
          <Card>
            <CardContent className='py-12 text-center'>
              <Rss className='text-muted-foreground mx-auto mb-4 size-12' />
              <h2 className='text-lg font-semibold'>No feeds yet</h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                Subscribe to feeds to see posts here, or create your own.
              </p>
              <div className='mt-4 flex justify-center gap-2'>
                <Button onClick={() => setCreateFeedDialogOpen(true)}>
                  <Plus className='size-4' />
                  New feed
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : allPosts.length === 0 ? (
          <Card>
            <CardContent className='py-12 text-center'>
              <Rss className='text-muted-foreground mx-auto mb-4 size-12' />
              <h2 className='text-lg font-semibold'>No posts yet</h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                Your subscribed feeds don't have any posts yet.
              </p>
            </CardContent>
          </Card>
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
      <FeedSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        search={search}
        onSearchChange={setSearch}
        searchResults={searchResults}
        isSearching={isSearching}
        onSubscribe={handleSubscribe}
      />

      {/* Create Feed Dialog */}
      <CreateFeedDialog
        open={createFeedDialogOpen}
        onOpenChange={setCreateFeedDialogOpen}
        hideTrigger
      />
    </>
  )
}
