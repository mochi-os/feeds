import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Main,
  Button,
  usePageTitle,
  EmptyState,
  ListSkeleton,
  EntityOnboardingEmptyState,
  PageHeader,
  type SortType,
  SortSelector,
  GeneralError,
  toast,
  getErrorMessage,
  useAuthStore,
} from '@mochi/common'
import { CheckCheck, Eye, EyeOff, Plus, Rss, SquarePen } from 'lucide-react'
import type { Feed, FeedPermissions, FeedPost, ReactionId } from '@/types'
import {
  useCommentActions,
  useFeedPosts,
  useFeeds,
  useFeedsWebsocket,
  useMarkAsRead,
  usePostActions,
  useReadOnScroll,
  useSubscription,
} from '@/hooks'
import { setLastFeed } from '@/hooks/use-feeds-storage'
import { useSidebarContext } from '@/context/sidebar-context'
import { OptionsMenu } from '@/components/options-menu'
import { FeedPosts } from '../components/feed-posts'
import { RecommendedFeeds } from '../components/recommended-feeds'
import { InlineFeedSearch } from '../components/inline-feed-search'
import { usePostHandlers } from '../hooks'
import { InterestSuggestionsDialog } from '../components/interest-suggestions-dialog'
import { useFeedsStore } from '@/stores/feeds-store'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { feedsApi } from '@/api/feeds'
import { STRINGS } from '@/features/feeds/constants'

interface FeedsListPageProps {
  feeds?: Feed[]
  loaderError?: string | null
  onRetryLoader?: () => void
}

export function FeedsListPage({
  feeds: _initialFeeds,
  loaderError,
  onRetryLoader,
}: FeedsListPageProps) {
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [permissionsByFeed, setPermissionsByFeed] = useState<Record<string, FeedPermissions>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [subscriptionErrorMessage, setSubscriptionErrorMessage] = useState<string | null>(null)
  const [readFilter, setReadFilter] = useLocalStorage<'all' | 'unread'>('feeds-read-filter', 'all')
  const validSorts: SortType[] = ['ai', 'interests', 'relevant', 'new', 'hot', 'top']
  const [rawSort, setSort] = useLocalStorage<SortType>('feeds-sort', 'interests')
  const sort = validSorts.includes(rawSort) ? rawSort : 'interests'
  useEffect(() => { if (rawSort !== sort) setSort(sort) }, [rawSort, sort, setSort])
  const loadedThisSession = useRef<Set<string>>(new Set())
  const [interestSuggestions, setInterestSuggestions] = useState<{
    feedId: string
    feedName: string
    suggestions: { qid: string; label: string; count: number }[]
  } | null>(null)

  const isLoggedIn = useAuthStore((state) => state.isAuthenticated)
  const storeFeeds = useFeedsStore((state) => state.feeds)
  const storeRefresh = useFeedsStore((state) => state.refresh)
  const setUnread = useFeedsStore((state) => state.setUnread)

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    refreshFeedsFromApi,
    mountedRef,
    userId,
    error,
  } = useFeeds({
    onPostsLoaded: setPostsByFeed,
  })

  // Refresh both local state and Zustand store (sidebar) together
  const refreshFeedsAndStore = useCallback(async () => {
    await refreshFeedsFromApi()
    void storeRefresh()
  }, [refreshFeedsFromApi, storeRefresh])

  // When store feeds change (e.g., subscribe from layout's search dialog),
  // refresh local feeds so posts load for newly subscribed feeds
  const prevStoreFeedCount = useRef(0)
  useEffect(() => {
    if (prevStoreFeedCount.current > 0 && storeFeeds.length !== prevStoreFeedCount.current) {
      void refreshFeedsFromApi()
    }
    prevStoreFeedCount.current = storeFeeds.length
  }, [storeFeeds.length, refreshFeedsFromApi])

  const { loadPostsForFeed, failedFeedIds, loadingFeedIds } = useFeedPosts({
    postsByFeed,
    setPostsByFeed,
    permissionsByFeed,
    setPermissionsByFeed,
  })

  useSubscription({
    feeds,
    setFeeds,
    setErrorMessage: setSubscriptionErrorMessage,
    refreshFeedsFromApi: refreshFeedsAndStore,
    mountedRef,
    onSubscribeSuccess: async (feedId, feedName) => {
      try {
        const suggestions = await feedsApi.suggestInterests(feedId)
        if (suggestions && suggestions.length > 0) {
          setInterestSuggestions({ feedId, feedName, suggestions })
        }
      } catch {
        // Silently ignore — suggestions are optional
      }
    },
  })

  const { postRefreshHandler, openCreateFeedDialog, openNewPostDialog } = useSidebarContext()
  useEffect(() => {
    postRefreshHandler.current = (feedId: string) => {
      const cacheKey = `${feedId}:${sort}`
      loadedThisSession.current.delete(cacheKey)
      void loadPostsForFeed(feedId, { forceRefresh: true, sort })
    }
    return () => {
      postRefreshHandler.current = null
    }
  }, [postRefreshHandler, loadPostsForFeed, sort])

  usePageTitle('Feeds')

  // Store that we're on "All Feeds" view for restoration on next entry
  useEffect(() => {
    setLastFeed(null)
  }, [])

  const subscribedFeeds = useMemo(
    () => feeds.filter((feed) => feed.isSubscribed || feed.isOwner),
    [feeds]
  )
  const subscribedFeedIds = useMemo(
    () => new Set(subscribedFeeds.map((feed) => feed.id)),
    [subscribedFeeds]
  )
  const failedSubscribedFeedIds = useMemo(
    () => [...failedFeedIds].filter((feedId) => subscribedFeedIds.has(feedId)),
    [failedFeedIds, subscribedFeedIds]
  )
  const subscriptionError = useMemo(
    () => (subscriptionErrorMessage ? new Error(subscriptionErrorMessage) : null),
    [subscriptionErrorMessage]
  )
  const sectionError = useMemo(
    () => (failedSubscribedFeedIds.length > 0 ? new Error(STRINGS.ERROR_LOAD_POSTS_FAILED) : null),
    [failedSubscribedFeedIds]
  )
  const retrySectionPostsLoad = useCallback(() => {
    for (const feedId of failedSubscribedFeedIds) {
      void loadPostsForFeed(feedId, { forceRefresh: true, sort })
    }
  }, [failedSubscribedFeedIds, loadPostsForFeed, sort])

  // Set of subscribed feed IDs for inline search
  const subscribedFeedSearchIds = useMemo(
    () => new Set(subscribedFeeds.flatMap((f) => [f.id, f.fingerprint].filter((x): x is string => !!x))),
    [subscribedFeeds]
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

  // Read tracking (multi-feed: null feedId, resolved per-post via data-feed-id attribute)
  const { markRead: rawMarkRead } = useMarkAsRead(null)
  const markRead = useCallback(
    (postId: string, feedId?: string) => {
      rawMarkRead(postId, feedId)
      if (feedId) {
        setPostsByFeed((current) => {
          const posts = current[feedId]
          if (!posts) return current
          const idx = posts.findIndex((p) => p.id === postId)
          if (idx === -1 || posts[idx].read) return current
          const updated = [...posts]
          updated[idx] = { ...updated[idx], read: Date.now() }
          return { ...current, [feedId]: updated }
        })
      }
    },
    [rawMarkRead, setPostsByFeed]
  )
  const { observePost } = useReadOnScroll(markRead)

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

    // When using relevance-based sort, server already scored posts — sort by score then created
    // Otherwise sort by timestamp (newest first)
    if (sort === 'relevant' || sort === 'ai' || sort === 'interests') {
      posts.sort((a, b) => {
        const scoreA = a.score ?? 0
        const scoreB = b.score ?? 0
        if (scoreB !== scoreA) return scoreB - scoreA
        return (b.created ?? 0) - (a.created ?? 0)
      })
    } else {
      posts.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    }
    return posts
  }, [subscribedFeeds, postsByFeed, permissionsByFeed, sort])
  const relevantFallback = useMemo(
    () =>
      (sort === 'relevant' || sort === 'ai' || sort === 'interests') &&
      allPosts.length > 0 &&
      allPosts.every((p) => p.score == null),
    [sort, allPosts]
  )

  const filteredPosts = useMemo(
    () => readFilter === 'unread' ? allPosts.filter((p) => (p.read ?? 0) === 0) : allPosts,
    [allPosts, readFilter]
  )

  const hasPendingSubscribedPosts = useMemo(
    () =>
      subscribedFeeds.some(
        (feed) => !(feed.id in postsByFeed) && !failedFeedIds.has(feed.id)
      ),
    [subscribedFeeds, postsByFeed, failedFeedIds]
  )
  const isLoadingSubscribedPosts =
    subscribedFeeds.length > 0 &&
    allPosts.length === 0 &&
    (loadingFeedIds.size > 0 || hasPendingSubscribedPosts)

  const { handlePostReaction } = usePostActions({
    selectedFeed: null,
    ownedFeeds,
    setFeeds,
    setSelectedFeedId: () => { },
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
      loadPostsForFeed,
    })

  // Use the shared post handlers hook
  const { handleEditPost, handleDeletePost, handleEditComment, handleDeleteComment } =
    usePostHandlers({
      onRefresh: loadPostsForFeed,
    })

  // Wrap interaction handlers to also mark the post as read
  const handlePostReactionAndRead = useCallback(
    (feedId: string, postId: string, reaction: ReactionId | '') => {
      markRead(postId, feedId)
      handlePostReaction(feedId, postId, reaction)
    },
    [handlePostReaction, markRead]
  )

  const handleAddCommentAndRead = useCallback(
    (feedId: string, postId: string, body?: string, files?: File[]) => {
      markRead(postId, feedId)
      handleAddComment(feedId, postId, body, files)
    },
    [handleAddComment, markRead]
  )

  const handleReplyAndRead = useCallback(
    (feedId: string, postId: string, parentCommentId: string, body: string, files?: File[]) => {
      markRead(postId, feedId)
      handleReplyToComment(feedId, postId, parentCommentId, body, files)
    },
    [handleReplyToComment, markRead]
  )

  const handleCommentReactionAndRead = useCallback(
    (feedId: string, postId: string, commentId: string, reaction: ReactionId | '') => {
      markRead(postId, feedId)
      handleCommentReaction(feedId, postId, commentId, reaction)
    },
    [handleCommentReaction, markRead]
  )

  // Interest adjustment — use first subscribed feed as context (interest is user-global)
  const defaultFeedFp = subscribedFeeds[0]?.fingerprint ?? subscribedFeeds[0]?.id ?? ''
  const handleInterestUp = useCallback(
    async (qidOrLabel: string, isLabel?: boolean) => {
      if (!defaultFeedFp) return
      try {
        await feedsApi.adjustTagInterest(defaultFeedFp, qidOrLabel, 'up', isLabel)
        toast.success('Interest boosted')
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to adjust interest'))
      }
    },
    [defaultFeedFp]
  )
  const handleInterestDown = useCallback(
    async (qidOrLabel: string, isLabel?: boolean) => {
      if (!defaultFeedFp) return
      try {
        await feedsApi.adjustTagInterest(defaultFeedFp, qidOrLabel, 'down', isLabel)
        toast.success('Interest reduced')
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to adjust interest'))
      }
    },
    [defaultFeedFp]
  )

  const handleTagAdded = useCallback(
    async (feedId: string, postId: string, label: string) => {
      try {
        const tag = await feedsApi.addPostTag(feedId, postId, label)
        setPostsByFeed((current) => {
          const updated: typeof current = {}
          for (const key of Object.keys(current)) {
            updated[key] = current[key].map((p) =>
              p.id === postId ? { ...p, tags: [...(p.tags || []), tag] } : p
            )
          }
          return updated
        })
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to add tag'))
        throw error
      }
    },
    []
  )

  const handleTagRemoved = useCallback(
    async (feedId: string, postId: string, tagId: string) => {
      try {
        await feedsApi.removePostTag(feedId, postId, tagId)
        setPostsByFeed((current) => {
          const updated: typeof current = {}
          for (const key of Object.keys(current)) {
            updated[key] = current[key].map((p) =>
              p.id === postId
                ? { ...p, tags: (p.tags || []).filter((t) => t.id !== tagId) }
                : p
            )
          }
          return updated
        })
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to remove tag'))
      }
    },
    []
  )

  const handleMarkAllRead = useCallback(async () => {
    try {
      const now = Date.now()
      await Promise.all(
        subscribedFeeds.map((feed) => {
          const id = feed.fingerprint ?? feed.id
          return feedsApi.readAll(id).then(() => setUnread(feed.id, 0))
        })
      )
      setPostsByFeed((current) => {
        const updated: typeof current = {}
        for (const key of Object.keys(current)) {
          updated[key] = current[key].map((p) => p.read ? p : { ...p, read: now })
        }
        return updated
      })
      toast.success('All marked as read')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to mark all as read'))
    }
  }, [subscribedFeeds, setUnread, setPostsByFeed])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  useEffect(() => {
    for (const feed of subscribedFeeds) {
      const cacheKey = `${feed.id}:${sort}`
      if (!loadedThisSession.current.has(cacheKey)) {
        loadedThisSession.current.add(cacheKey)
        void loadPostsForFeed(feed.id, { sort })
      }
    }
  }, [subscribedFeeds, loadPostsForFeed, sort])

  return (
    <>
      <PageHeader
        title="Feeds"
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
            {ownedFeeds.length > 0 && (
              <Button onClick={() => openNewPostDialog('')}>
                <SquarePen className='mr-2 size-4' />
                New post
              </Button>
            )}
            <SortSelector value={sort} onValueChange={setSort} />
            <OptionsMenu showRss />
          </>
        }
      />
      <Main>
        <div className='flex flex-col gap-4'>
          {loaderError ? (
            <div className="mb-4">
              <GeneralError
                error={new Error(loaderError)}
                reset={onRetryLoader}
                minimal
                mode='inline'
              />
            </div>
          ) : null}
          {error ? (
            <div className="mb-4">
              <GeneralError
                error={error}
                reset={refreshFeedsFromApi}
                minimal
                mode='inline'
              />
            </div>
          ) : null}
          {subscriptionError ? (
            <div className="mb-4">
              <GeneralError
                error={subscriptionError}
                reset={() => setSubscriptionErrorMessage(null)}
                minimal
                mode='inline'
              />
            </div>
          ) : null}
          {sectionError ? (
            <div className="mb-4">
              <GeneralError
                error={sectionError}
                reset={retrySectionPostsLoad}
                minimal
                mode='inline'
              />
            </div>
          ) : null}

          {isLoadingFeeds ? (
            <ListSkeleton count={3} />
          ) : (
            <div className='space-y-6'>
              {subscribedFeeds.length === 0 ? (
                <EntityOnboardingEmptyState
                  icon={Rss}
                  title='Feeds'
                  description='You have no feeds yet.'
                  searchSlot={<InlineFeedSearch subscribedIds={subscribedFeedSearchIds} onRefresh={() => void refreshFeedsAndStore()} />}
                  primaryActionSlot={(
                    <Button variant="outline" onClick={openCreateFeedDialog}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create a new feed
                    </Button>
                  )}
                  secondarySlot={(
                    <RecommendedFeeds
                      subscribedIds={subscribedFeedSearchIds}
                      onSubscribe={() => void refreshFeedsAndStore()}
                    />
                  )}
                />
              ) : isLoadingSubscribedPosts ? (
                <ListSkeleton count={3} />
              ) : filteredPosts.length === 0 ? (
                <div className='py-12'>
                  <EmptyState
                    icon={readFilter === 'unread' ? CheckCheck : Rss}
                    title={readFilter === 'unread' ? 'All caught up' : 'No posts yet'}
                  >
                    {readFilter === 'unread' && (
                      <Button variant='outline' onClick={() => setReadFilter('all')}>
                        View all posts
                      </Button>
                    )}
                  </EmptyState>
                </div>
              ) : (
                <>
                  {relevantFallback && (
                    <div className='bg-muted/50 text-muted-foreground rounded-[10px] px-4 py-3 text-sm'>
                      No interests configured yet. Posts are shown in chronological order. Add interests in feed settings to enable personalised ranking.
                    </div>
                  )}
                <FeedPosts
                  posts={filteredPosts}
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
                  onInterestUp={handleInterestUp}
                  onInterestDown={handleInterestDown}
                  onPostClick={markRead}
                  observePost={observePost}
                  showFeedName
                />
                </>
              )}
            </div>
          )}
        </div>
      </Main>

      {interestSuggestions && (
        <InterestSuggestionsDialog
          open={!!interestSuggestions}
          onOpenChange={(open) => { if (!open) setInterestSuggestions(null) }}
          feedId={interestSuggestions.feedId}
          feedName={interestSuggestions.feedName}
          suggestions={interestSuggestions.suggestions}
        />
      )}
    </>
  )
}
