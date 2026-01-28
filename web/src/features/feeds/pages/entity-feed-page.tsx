import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  useFeedWebsocket,
  useInfinitePosts,
  usePostActions,
  useCommentActions,
} from '@/hooks'
import type { Feed, FeedPermissions, FeedSummary, FeedPost } from '@/types'
import {
  Main,
  Card,
  CardContent,
  Button,
  useAuthStore,
  usePageTitle,
  useScreenSize,
  LoadMoreTrigger,
  Skeleton,
  EmptyState,
  PageHeader,
  SortSelector,
  type SortType,
  ViewSelector,
  type ViewMode,
} from '@mochi/common'
import {
  AlertTriangle,
  Plus,
  Rss,
  Settings,
  SquarePen,
} from 'lucide-react'
import { mapFeedsToSummaries } from '@/api/adapters'

import { useSidebarContext } from '@/context/sidebar-context'
import { FeedPosts } from '../components/feed-posts'
import { usePostHandlers } from '../hooks'
import { useLocalStorage } from '@/hooks/use-local-storage'

interface EntityFeedPageProps {
  feed: Feed
  permissions?: FeedPermissions
}

export function EntityFeedPage({
  feed,
  permissions: _initialPermissions,
}: EntityFeedPageProps) {
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<SortType>('new')
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>(
    'feeds-view-mode',
    'card'
  )
  const isLoggedIn = useAuthStore((state) => state.isAuthenticated)
  const { isMobile } = useScreenSize()

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
    sort,
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
        owner: feed.owner ? 'You' : 'Subscribed feed',
        subscribers: feed.subscribers ?? 0,
        unreadPosts: 0,
        lastActive: '',
        isSubscribed: true,
        isOwner: !!feed.owner,
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
    refreshFeedsFromApi: async () => {
      await refreshPosts()
    },
  })

  const { handleAddComment, handleReplyToComment, handleCommentReaction } =
    useCommentActions({
      setFeeds,
      setPostsByFeed,
      loadedFeedsRef,
      commentDrafts,
      setCommentDrafts,
    })

  // Use the shared post handlers hook for edit/delete
  const {
    handleEditPost,
    handleDeletePost,
    handleEditComment,
    handleDeleteComment,
  } = usePostHandlers({
    onRefresh: (_feedId: string) => refreshPosts(),
  })

  // Filter posts by search term (if search is implemented)
  const currentPosts = postsByFeed[feed.id] || infinitePosts

  // Determine permissions and subscription status
  const canPost = permissions?.manage || _initialPermissions?.manage || false
  const canManage = permissions?.manage || _initialPermissions?.manage || false
  const isSubscribed = feedSummary.isSubscribed
  const canUnsubscribe = isSubscribed && !canManage

  return (
    <>
      <PageHeader
        title={feedSummary.name}
        icon={<Rss className='size-4 md:size-5' />}

        actions={
          <>
            {canPost && (
              <Button onClick={() => openNewPostDialog(feed.id)}>
                <SquarePen className='mr-2 size-4' />
                New post
              </Button>
            )}
            {canUnsubscribe && (
              <Button
                variant='outline'
                onClick={() => {
                  // TODO: Implement unsubscribe functionality
                }}
              >
                Unsubscribe
              </Button>
            )}
            {canManage && (
              <Button variant='outline' asChild>
                <Link
                  to='/$feedId/settings'
                  params={{ feedId: feed.fingerprint ?? feed.id }}
                >
                  <Settings className={isMobile ? 'size-4' : 'mr-2 size-4'} />
                  {!isMobile && 'Settings'}
                </Link>
              </Button>
            )}
          </>
        }
      />
      <Main fixed>
        <div className='flex-1 overflow-y-auto px-4 md:px-0'>
          {/* Header row with sort and view controls - always visible */}
          <div className='flex items-center justify-end gap-2 py-4'>
            <SortSelector value={sort} onValueChange={setSort} />
            <ViewSelector value={viewMode} onValueChange={setViewMode} />
          </div>

          {isLoadingPosts ? (
            <div className='flex flex-col gap-4 py-2'>
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
          ) : isError ? (
            <Card className='border-destructive/20 bg-destructive/5 mx-auto mt-8 max-w-md'>
              <CardContent className='flex flex-col items-center py-10 text-center'>
                <AlertTriangle className='text-destructive mb-3 size-10' />
                <h3 className='text-lg font-semibold'>Error loading posts</h3>
                <p className='text-muted-foreground mt-1 text-sm'>
                  We couldn't load the posts for this feed.
                </p>
                <Button
                  variant='outline'
                  className='mt-6'
                  onClick={() => refreshPosts()}
                >
                  Try again
                </Button>
              </CardContent>
            </Card>

          ) : (
            <div className='pb-20'>
              {currentPosts.length === 0 ? (
                <div className='py-24'>
                  <EmptyState
                    icon={Rss}
                    title='No posts yet'
                    description={
                      sort === 'new'
                        ? "This feed doesn't have any posts yet. Be the first to start the conversation!"
                        : `No posts found with ${sort} sorting.`
                    }
                  >
                    {isLoggedIn && canPost && (
                      <Button onClick={() => openNewPostDialog(feed.id)}>
                        <Plus className='mr-2 size-4' />
                        Create the first post
                      </Button>
                    )}
                  </EmptyState>
                </div>
              ) : (
                <div className='space-y-6'>
                  <FeedPosts
                    posts={currentPosts}
                    sort={sort}
                    onSortChange={setSort}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
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
                    permissions={
                      permissions ||
                      _initialPermissions || {
                        view: true,
                        react: true,
                        comment: true,
                        manage: false,
                      }
                    }
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
          )}
        </div>
      </Main>


    </>
  )
}
