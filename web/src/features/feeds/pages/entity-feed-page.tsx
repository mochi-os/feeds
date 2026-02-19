import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  useFeedWebsocket,
  useInfinitePosts,
  usePostActions,
  useCommentActions,
} from '@/hooks'
import type { Feed, FeedPermissions, FeedSummary, FeedPost } from '@/types'
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
  type ViewMode,
} from '@mochi/common'
import {
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
  const [isUnsubscribing, setIsUnsubscribing] = useState(false)
  const [activeTag, setActiveTag] = useState<string | undefined>(undefined)
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>(
    'feeds-view-mode',
    'card'
  )
  const isLoggedIn = useAuthStore((state) => state.isAuthenticated)
  const navigate = useNavigate()
  const refreshSidebar = useFeedsStore((state) => state.refresh)

  // Local state needed for hooks
  const [_feeds, setFeeds] = useState<FeedSummary[]>([])
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const loadedFeedsRef = useRef<Set<string>>(new Set())

  // Fetch posts and permissions using the infinite query
  const {
    posts: infinitePosts,
    permissions,
    isLoading: isLoadingPosts,
    ErrorComponent,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch: refreshPosts,
  } = useInfinitePosts({
    feedId: feed.id,
    entityContext: true,
    tag: activeTag,
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

  // Tag management callbacks
  const handleTagAdded = useCallback(
    (postId: string, tag: { id: string; label: string }) => {
      setPostsByFeed((current) => {
        const feedPosts = current[feed.id] || infinitePosts
        return {
          ...current,
          [feed.id]: feedPosts.map((p) =>
            p.id === postId ? { ...p, tags: [...(p.tags || []), tag] } : p
          ),
        }
      })
    },
    [feed.id, infinitePosts]
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

  // Filter posts by search term (if search is implemented)
  const currentPosts = postsByFeed[feed.id] || infinitePosts

  // Determine permissions and subscription status
  const canPost = permissions?.manage || _initialPermissions?.manage || false
  const canManage = permissions?.manage || _initialPermissions?.manage || false
  const isSubscribed = feedSummary.isSubscribed
  const canUnsubscribe = isSubscribed && !canManage

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
            {canPost && (
              <Button onClick={() => openNewPostDialog(feed.id)}>
                <SquarePen className='mr-2 size-4' />
                New post
              </Button>
            )}
            <OptionsMenu
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              entityId={feed.fingerprint}
              onSettings={canManage ? () => void navigate({ to: '/$feedId/settings', params: { feedId: feed.fingerprint ?? feed.id } }) : undefined}
              onUnsubscribe={canUnsubscribe ? handleUnsubscribe : undefined}
              isUnsubscribing={isUnsubscribing}
            />
          </>
        }
      />
      <Main fixed>
        <div className='flex-1 overflow-y-auto px-4 md:px-0'>
          {isLoadingPosts ? (
            <ListSkeleton count={3} className='py-2' />
          ) : ErrorComponent ? (
            <div className='mx-auto mt-8 max-w-md'>
              {ErrorComponent}
            </div>
          ) : (
            <div className='pb-20'>
              {currentPosts.length === 0 ? (
                <div className='py-24'>
                  <EmptyState
                    icon={Rss}
                    title='No posts yet'
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
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    commentDrafts={commentDrafts}
                    onDraftChange={(postId: string, value: string) =>
                      setCommentDrafts((prev) => ({ ...prev, [postId]: value }))
                    }
                    onAddComment={handleAddComment}
                    onReplyToComment={handleReplyToComment}
                    onPostReaction={handlePostReaction}
                    onCommentReaction={(feedId, postId, commentId, reaction) => {
                      handleCommentReaction(feedId, postId, commentId, reaction)
                    }}
                    onEditPost={handleEditPost}
                    onDeletePost={handleDeletePost}
                    onEditComment={handleEditComment}
                    onDeleteComment={handleDeleteComment}
                    onTagAdded={handleTagAdded}
                    onTagRemoved={handleTagRemoved}
                    onTagFilter={handleTagFilter}
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
