import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  useFeedWebsocket,
  useInfinitePosts,
  useMarkAsRead,
  usePostActions,
  useCommentActions,
  useReadOnScroll,
} from '@/hooks'
import type { Feed, FeedPermissions, FeedSummary, FeedPost, ReactionId } from '@/types'
import {
  Main,
  Button,
  useAuthStore,
  usePageTitle,
  LoadMoreTrigger,
  toast,
  getErrorMessage,
  EmptyState,
  PageHeader,
  ListSkeleton,
  SortSelector,
  type SortType,
  GeneralError,
  useShellStorage,
} from '@mochi/common'
import {
  CheckCheck,
  Eye,
  EyeOff,
  Plus,
  Rss,
  SquarePen,
  X,
} from 'lucide-react'
import { mapFeedsToSummaries } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'

import { useSidebarContext } from '@/context/sidebar-context'
import { useFeedsStore } from '@/stores/feeds-store'
import { OptionsMenu } from '@/components/options-menu'
import { FeedPosts } from '../components/feed-posts'
import { usePostHandlers } from '../hooks'

interface EntityFeedPageProps {
  feed: Feed
  permissions?: FeedPermissions
}

export function EntityFeedPage({
  feed,
  permissions: _initialPermissions,
}: EntityFeedPageProps) {
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [isUnsubscribing, setIsUnsubscribing] = useState(false)
  const [activeTag, setActiveTag] = useState<string | undefined>(undefined)
  const isLoggedIn = useAuthStore((state) => state.isAuthenticated)
  const [readFilter, setReadFilter] = useShellStorage<'all' | 'unread'>('feeds-read-filter', 'all')
  const [savedSort, setSort] = useShellStorage<SortType>('feeds-sort', 'new')
  const sort = isLoggedIn ? savedSort : 'new'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refreshSidebar = useFeedsStore((state) => state.refresh)
  const setUnread = useFeedsStore((state) => state.setUnread)

  // Local state needed for hooks
  const [_feeds, setFeeds] = useState<FeedSummary[]>([])
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const loadedFeedsRef = useRef<Set<string>>(new Set())

  // Fetch posts and permissions using the infinite query
  const {
    posts: infinitePosts,
    permissions,
    hasAi,
    feedRead,
    isLoading: isLoadingPosts,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch: refreshPosts,
  } = useInfinitePosts({
    feedId: feed.id,
    entityContext: true,
    tag: activeTag,
    sort,
    unread: readFilter === 'unread',
  })
  const sortOptions: SortType[] = useMemo(() => {
    const opts: SortType[] = []
    if (hasAi) opts.push('ai')
    opts.push('interests', 'new', 'hot', 'top')
    return opts
  }, [hasAi])

  // Read tracking
  const { markRead } = useMarkAsRead(feed.fingerprint ?? feed.id)
  const { observePost } = useReadOnScroll(markRead)

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

  // Sync infinite posts to local state for hooks
  useEffect(() => {
    setPostsByFeed((current) => ({
      ...current,
      [feed.id]: infinitePosts,
    }))
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
    loadPostsForFeed: async (_feedId: string) => {
      await refreshPosts()
    },
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
      loadPostsForFeed: async (_feedId: string) => {
        await refreshPosts()
      },
    })

  // Use the shared post handlers hook for edit/delete
  const {
    handleEditPost,
    handleDeletePost,
    handleEditComment,
    handleDeleteComment,
  } = usePostHandlers({
    onRefresh: async (_feedId: string) => {
      await refreshPosts()
    },
  })

  // Wrap interaction handlers to also mark the post as read
  const handlePostReactionAndRead = useCallback(
    (feedId: string, postId: string, reaction: ReactionId | '') => {
      markRead(postId, feed.fingerprint ?? feed.id)
      handlePostReaction(feedId, postId, reaction)
    },
    [handlePostReaction, markRead, feed.fingerprint, feed.id]
  )

  const handleAddCommentAndRead = useCallback(
    (feedId: string, postId: string, body?: string, files?: File[]) => {
      markRead(postId, feed.fingerprint ?? feed.id)
      handleAddComment(feedId, postId, body, files)
    },
    [handleAddComment, markRead, feed.fingerprint, feed.id]
  )

  const handleReplyAndRead = useCallback(
    (feedId: string, postId: string, parentCommentId: string, body: string, files?: File[]) => {
      markRead(postId, feed.fingerprint ?? feed.id)
      handleReplyToComment(feedId, postId, parentCommentId, body, files)
    },
    [handleReplyToComment, markRead, feed.fingerprint, feed.id]
  )

  const handleCommentReactionAndRead = useCallback(
    (feedId: string, postId: string, commentId: string, reaction: ReactionId | '') => {
      markRead(postId, feed.fingerprint ?? feed.id)
      handleCommentReaction(feedId, postId, commentId, reaction)
    },
    [handleCommentReaction, markRead, feed.fingerprint, feed.id]
  )

  // Tag management callbacks
  const handleTagAdded = useCallback(
    async (_feedId: string, postId: string, label: string) => {
      try {
        const tag = await feedsApi.addPostTag(
          feed.fingerprint ?? feed.id,
          postId,
          label
        )
        setPostsByFeed((current) => {
          const feedPosts = current[feed.id] || infinitePosts
          return {
            ...current,
            [feed.id]: feedPosts.map((p) =>
              p.id === postId ? { ...p, tags: [...(p.tags || []), tag] } : p
            ),
          }
        })
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to add tag'))
        throw error
      }
    },
    [feed.id, feed.fingerprint, infinitePosts]
  )

  const handleTagRemoved = useCallback(
    async (_feedId: string, postId: string, tagId: string) => {
      try {
        await feedsApi.removePostTag(
          feed.fingerprint ?? feed.id,
          postId,
          tagId
        )
        setPostsByFeed((current) => {
          const feedPosts = current[feed.id] || infinitePosts
          return {
            ...current,
            [feed.id]: feedPosts.map((p) =>
              p.id === postId
                ? { ...p, tags: (p.tags || []).filter((t) => t.id !== tagId) }
                : p
            ),
          }
        })
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to remove tag'))
      }
    },
    [feed.id, feed.fingerprint, infinitePosts]
  )

  const handleTagFilter = useCallback((label: string) => {
    setActiveTag((current) => (current === label ? undefined : label))
  }, [])

  const handleInterestUp = useCallback(
    async (qidOrLabel: string, isLabel?: boolean) => {
      try {
        await feedsApi.adjustTagInterest(feed.fingerprint ?? feed.id, qidOrLabel, 'up', isLabel)
        toast.success('Interest boosted')
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to adjust interest'))
      }
    },
    [feed.id, feed.fingerprint]
  )

  const handleInterestDown = useCallback(
    async (qidOrLabel: string, isLabel?: boolean) => {
      try {
        await feedsApi.adjustTagInterest(feed.fingerprint ?? feed.id, qidOrLabel, 'down', isLabel)
        toast.success('Interest reduced')
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to adjust interest'))
      }
    },
    [feed.id, feed.fingerprint]
  )

  // Filter posts by search term (if search is implemented)
  const currentPosts = postsByFeed[feed.id] || infinitePosts

  // Determine permissions and subscription status
  const canPost = permissions?.manage || _initialPermissions?.manage || false
  const canManage = permissions?.manage || _initialPermissions?.manage || false
  const isSubscribed = feedSummary.isSubscribed
  const canUnsubscribe = isSubscribed && !canManage

  const handleMarkAllRead = useCallback(async () => {
    try {
      await feedsApi.readAll(feed.fingerprint ?? feed.id)
      // Remove stale unread query cache so switching to "Unread" filter
      // does a fresh fetch instead of briefly showing old data
      queryClient.removeQueries({
        queryKey: ['posts', feed.id],
        predicate: (query) => {
          const key = query.queryKey as [string, string, { unread?: boolean }]
          return key[2]?.unread === true
        },
      })
      setUnread(feed.id, 0)
      void refreshPosts()
      toast.success('All marked as read')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to mark all as read'))
    }
  }, [feed.id, feed.fingerprint, refreshPosts, queryClient, setUnread])

  const handleUnsubscribe = useCallback(async () => {
    if (isUnsubscribing) return
    setIsUnsubscribing(true)
    try {
      await feedsApi.unsubscribe(feed.id)
      void refreshSidebar()
      toast.success('Unsubscribed')
      void navigate({ to: '/' })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to unsubscribe'))
    } finally {
      setIsUnsubscribing(false)
    }
  }, [feed.id, isUnsubscribing, refreshSidebar, navigate])

  return (
    <>
      <PageHeader
        title={feedSummary.name}
        icon={<Rss className='size-4 md:size-5' />}

        actions={
          <>
            {isLoggedIn && (
              <div className='flex items-center gap-1'>
                <Button
                  variant={readFilter === 'all' ? 'default' : 'ghost'}
                  size='sm'
                  onClick={() => setReadFilter('all')}
                >
                  <Eye className='mr-1 size-3.5' />
                  All
                </Button>
                <Button
                  variant={readFilter === 'unread' ? 'default' : 'ghost'}
                  size='sm'
                  onClick={() => setReadFilter('unread')}
                >
                  <EyeOff className='mr-1 size-3.5' />
                  Unread
                </Button>
                <Button variant='ghost' size='sm' onClick={handleMarkAllRead}>
                  <CheckCheck className='mr-1 size-3.5' />
                  Mark all read
                </Button>
              </div>
            )}
            {isLoggedIn && <SortSelector value={sort} onValueChange={setSort} options={sortOptions} />}
            {canPost && (
              <Button onClick={() => openNewPostDialog(feed.id)}>
                <SquarePen className='mr-2 size-4' />
                New post
              </Button>
            )}
            <OptionsMenu
              entityId={feed.fingerprint}
              onSettings={isLoggedIn && (canManage || isSubscribed) ? () => void navigate({ to: '/$feedId/settings', params: { feedId: feed.fingerprint ?? feed.id } }) : undefined}
              onUnsubscribe={isLoggedIn && canUnsubscribe ? handleUnsubscribe : undefined}
              isUnsubscribing={isUnsubscribing}
            />
          </>
        }
      />
      <Main fixed>
        <div className='flex-1 overflow-y-auto px-4 md:px-0'>
          {isLoadingPosts ? (
            <ListSkeleton count={3} className='py-2' />
          ) : error ? (
            <div className='mx-auto mt-8 max-w-md'>
              <GeneralError
                error={error}
                minimal
                mode='inline'
                reset={refreshPosts}
              />
            </div>
          ) : (
            <div className='pb-20'>
              {currentPosts.length === 0 ? (
                <div className='py-24'>
                  <EmptyState
                    icon={readFilter === 'unread' ? CheckCheck : Rss}
                    title={readFilter === 'unread' ? 'All caught up' : 'No posts yet'}
                  >
                    {readFilter === 'unread' ? (
                      <Button variant='outline' onClick={() => setReadFilter('all')}>
                        View all posts
                      </Button>
                    ) : isLoggedIn && canPost ? (
                      <Button onClick={() => openNewPostDialog(feed.id)}>
                        <Plus className='mr-2 size-4' />
                        Create the first post
                      </Button>
                    ) : null}
                  </EmptyState>
                </div>
              ) : (
                <div className='space-y-6'>
                  {activeTag && (
                    <div className='flex items-center gap-2'>
                      <span className='text-muted-foreground text-sm'>Filtered by tag:</span>
                      <button
                        type='button'
                        className='bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium'
                        onClick={() => setActiveTag(undefined)}
                      >
                        {activeTag}
                        <X className='size-3.5' />
                      </button>
                    </div>
                  )}
                  <FeedPosts
                    posts={currentPosts}
                    commentDrafts={commentDrafts}
                    onDraftChange={(postId: string, value: string) =>
                      setCommentDrafts((prev) => ({ ...prev, [postId]: value }))
                    }
                    onAddComment={handleAddCommentAndRead}
                    onReplyToComment={handleReplyAndRead}
                    onPostReaction={handlePostReactionAndRead}
                    onCommentReaction={handleCommentReactionAndRead}
                    onEditPost={handleEditPost}
                    onDeletePost={handleDeletePost}
                    onEditComment={handleEditComment}
                    onDeleteComment={handleDeleteComment}
                    onTagAdded={handleTagAdded}
                    onTagRemoved={handleTagRemoved}
                    onTagFilter={handleTagFilter}
                    onInterestUp={handleInterestUp}
                    onInterestDown={handleInterestDown}
                    isFeedOwner={feedSummary.isOwner ?? false}
                    feedRead={feedRead}
                    onPostClick={markRead}
                    observePost={observePost}
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
