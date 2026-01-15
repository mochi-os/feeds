import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Main,
  Card,
  CardContent,
  Button,
  useAuthStore,
  usePageTitle,
  useScreenSize,
  LoadMoreTrigger,
} from '@mochi/common'
import { AlertTriangle, Loader2, Plus, Rss, SquarePen, Search } from 'lucide-react'
import type { Feed, FeedPermissions, FeedSummary, FeedPost } from '@/types'
import { mapFeedsToSummaries } from '@/api/adapters'
import { useFeedWebsocket, useInfinitePosts, usePostActions, useCommentActions } from '@/hooks'
import { useSidebarContext } from '@/context/sidebar-context'
import { PageHeader } from '@mochi/common'
import { FeedPosts } from '../components/feed-posts'
import { FeedSearchDialog } from '../components/feed-search-dialog'
import { useFeedSearch, usePostHandlers } from '../hooks'

interface EntityFeedPageProps {
  feed: Feed
  permissions?: FeedPermissions
}

export function EntityFeedPage({ feed, permissions: _initialPermissions }: EntityFeedPageProps) {
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const email = useAuthStore((state) => state.email)
  const isLoggedIn = !!email
  const { isMobile } = useScreenSize()

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

  // Local state needed for hooks
  const [_feeds, setFeeds] = useState<FeedSummary[]>([])
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const loadedFeedsRef = useRef<Set<string>>(new Set())

  // Fetch posts and permissions using the infinite query
  const {
    posts: infinitePosts,
    permissions,
    isLoading: isLoadingPosts,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch: refreshPosts,
  } = useInfinitePosts({
    feedId: feed.id,
    entityContext: true,
  })

  // Map feed to summary format
  const feedSummary: FeedSummary = useMemo(() => {
    const mapped = mapFeedsToSummaries([feed], new Set())
    return (
      mapped[0] || {
        id: feed.id,
        name: feed.name || feed.fingerprint || 'Feed',
        description: '',
        tags: [],
        owner: feed.owner === 1 ? 'You' : 'Subscribed feed',
        subscribers: feed.subscribers ?? 0,
        unreadPosts: 0,
        lastActive: '',
        isSubscribed: true,
        isOwner: feed.owner === 1,
        fingerprint: feed.fingerprint,
        privacy: feed.privacy,
        permissions: permissions || _initialPermissions,
      }
    )
  }, [feed, permissions, _initialPermissions])

  // Sync infinite posts to local state for hooks if needed
  useEffect(() => {
    if (infinitePosts.length > 0) {
      setPostsByFeed((current) => ({
        ...current,
        [feed.id]: infinitePosts,
      }))
    }
  }, [infinitePosts, feed.id])

  // Set page title to feed name
  usePageTitle(feedSummary.name)

  // Register with sidebar context
  const { setFeedId, openNewPostDialog } = useSidebarContext()
  useEffect(() => {
    setFeedId(feed.id)
    return () => setFeedId(null)
  }, [feed.id, setFeedId])

  // Connect to WebSocket for real-time updates
  useFeedWebsocket(feed.fingerprint)

  // Standardized actions
  const { handlePostReaction } = usePostActions({
    selectedFeed: feedSummary,
    ownedFeeds: feedSummary.isOwner ? [feedSummary] : [],
    setFeeds,
    setSelectedFeedId: () => {},
    setPostsByFeed,
    loadPostsForFeed: (_feedId: string) => refreshPosts(),
    loadedFeedsRef,
    refreshFeedsFromApi: async () => { await refreshPosts() },
  })
  
  const { handleAddComment, handleReplyToComment, handleCommentReaction } = useCommentActions({
    setFeeds,
    setPostsByFeed,
    loadedFeedsRef,
    commentDrafts,
    setCommentDrafts,
  })

  // Use the shared post handlers hook for edit/delete
  const { handleEditPost, handleDeletePost, handleEditComment, handleDeleteComment } =
    usePostHandlers({
      onRefresh: (_feedId: string) => refreshPosts(),
    })

  // Filter posts by search term
  const currentPosts = postsByFeed[feed.id] || infinitePosts
  const filteredPosts = useMemo(() => {
    if (!search) return currentPosts
    const searchLower = search.toLowerCase()
    return currentPosts.filter((post) => post.body?.toLowerCase().includes(searchLower))
  }, [currentPosts, search])

  return (
    <>
      <PageHeader
        title={feedSummary.name}
        icon={<Rss className='size-4 md:size-5' />}
        searchBar={
          <Button 
            variant='outline' 
            className='w-full justify-start'
            onClick={() => setSearchDialogOpen(true)}
          >
            <Search className='mr-2 size-4' />
            Search posts
          </Button>
        }
        actions={
          <>
            {!isMobile && (
              <Button
                variant='outline'
                onClick={() => setSearchDialogOpen(true)}
              >
                <Search className='mr-2 size-4' />
                Search
              </Button>
            )}
            {isLoggedIn && (permissions?.manage || _initialPermissions?.manage) && (
              <Button onClick={() => openNewPostDialog(feed.id)}>
                <SquarePen className='mr-2 size-4' />
                New post
              </Button>
            )}
          </>
        }
      />
      <Main fixed>
        <div className='flex-1 overflow-y-auto'>
          {isLoadingPosts ? (
            <div className='flex flex-col items-center justify-center py-12'>
              <Loader2 className='text-primary size-8 animate-spin' />
              <p className='text-muted-foreground mt-2 text-sm'>Loading posts...</p>
            </div>
          ) : isError ? (
            <Card className='border-destructive/20 mx-auto mt-8 max-w-md bg-destructive/5'>
              <CardContent className='flex flex-col items-center py-10 text-center'>
                <AlertTriangle className='text-destructive mb-3 size-10' />
                <h3 className='text-lg font-semibold'>Error loading posts</h3>
                <p className='text-muted-foreground mt-1 text-sm'>
                  We couldn't load the posts for this feed.
                </p>
                <Button variant='outline' className='mt-6' onClick={() => refreshPosts()}>
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : currentPosts.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-24 text-center'>
              <div className='bg-muted/50 mb-4 rounded-full p-6'>
                <Rss className='text-muted-foreground size-12 opacity-20' />
              </div>
              <h3 className='text-xl font-semibold'>
                {search ? 'No matching posts' : 'No posts yet'}
              </h3>
              <p className='text-muted-foreground mt-2 max-w-xs'>
                {search
                  ? 'Try adjusting your search terms to find what you are looking for.'
                  : "This feed doesn't have any posts yet. Be the first to start the conversation!"}
              </p>
              {isLoggedIn && (permissions?.manage || _initialPermissions?.manage) && !search && (
                <Button className='mt-6' onClick={() => openNewPostDialog(feed.id)}>
                  <Plus className='mr-2 size-4' />
                  Create the first post
                </Button>
              )}
            </div>
          ) : (
            <div className='space-y-6 pb-20'>
              <FeedPosts
                posts={filteredPosts}
                commentDrafts={commentDrafts}
                onDraftChange={(postId: string, value: string) =>
                  setCommentDrafts((prev) => ({ ...prev, [postId]: value }))
                }
                onAddComment={(feedId, postId, body) => {
                  handleAddComment(feedId, postId, body)
                }}
                onReplyToComment={(feedId, postId, parentId, body) => {
                  handleReplyToComment(feedId, postId, parentId, body)
                }}
                onPostReaction={handlePostReaction}
                onCommentReaction={(feedId, postId, commentId, reaction) => {
                  handleCommentReaction(feedId, postId, commentId, reaction)
                }}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
                onEditComment={handleEditComment}
                onDeleteComment={handleDeleteComment}
                isFeedOwner={feedSummary.isOwner ?? false}
                permissions={permissions || _initialPermissions || { view: true, react: true, comment: true, manage: false }}
              />
              
              {hasNextPage && (
                <LoadMoreTrigger
                  onLoadMore={() => void fetchNextPage()}
                  hasMore={hasNextPage}
                  isLoading={isFetchingNextPage}
                />
              )}
            </div>
          )}
        </div>
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
    </>
  )
}
