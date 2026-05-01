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
  useShellStorage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@mochi/web'
import { Check, CheckCheck, ChevronDown, Eye, EyeOff, Plus, Rss, SquarePen } from 'lucide-react'
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

import { Trans, useLingui } from '@lingui/react/macro'
import { feedsApi } from '@/api/feeds'

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
  const { t } = useLingui()
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [permissionsByFeed, setPermissionsByFeed] = useState<Record<string, FeedPermissions>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [subscriptionErrorMessage, setSubscriptionErrorMessage] = useState<string | null>(null)
  const isLoggedIn = useAuthStore((state) => state.isAuthenticated)
  const currentUserId = useAuthStore((state) => state.identity)
  const currentUserName = useAuthStore((state) => state.name)
  const [readFilter, setReadFilter] = useShellStorage<'all' | 'unread'>('feeds-read-filter', 'all')
  const loadedThisSession = useRef<Set<string>>(new Set())
  const [interestSuggestions, setInterestSuggestions] = useState<{
    feedId: string
    feedName: string
    suggestions: { qid: string; label: string; count: number }[]
  } | null>(null)
  const storeFeeds = useFeedsStore((state) => state.feeds)
  const storeRefresh = useFeedsStore((state) => state.refresh)
  const setUnread = useFeedsStore((state) => state.setUnread)
  const defaultSort = useFeedsStore((state) => state.defaultSort)
  const setDefaultSort = useFeedsStore((state) => state.setDefaultSort)
  const sort: SortType = (isLoggedIn ? (defaultSort || 'interests') : 'new') as SortType
  const setSort = useCallback((value: SortType) => {
    void setDefaultSort(value)
  }, [setDefaultSort])

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    refreshFeedsFromApi,
    mountedRef,
    userId,
    error,
    hasAi,
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
      const cacheKey = `${feedId}:${sort}:${readFilter}`
      loadedThisSession.current.delete(cacheKey)
      void loadPostsForFeed(feedId, { forceRefresh: true, sort, unread: readFilter === 'unread' ? '1' : undefined })
    }
    return () => {
      postRefreshHandler.current = null
    }
  }, [postRefreshHandler, loadPostsForFeed, sort, readFilter])

  usePageTitle(t`Feeds`)

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
    () => (failedSubscribedFeedIds.length > 0 ? new Error("Unable to load posts for this feed right now.") : null),
    [failedSubscribedFeedIds]
  )
  const retrySectionPostsLoad = useCallback(() => {
    for (const feedId of failedSubscribedFeedIds) {
      void loadPostsForFeed(feedId, { forceRefresh: true, sort, unread: readFilter === 'unread' ? '1' : undefined })
    }
  }, [failedSubscribedFeedIds, loadPostsForFeed, sort, readFilter])

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
  const { markRead: rawMarkRead, readLocally } = useMarkAsRead(null)
  const markRead = useCallback(
    (postId: string, feedId?: string) => {
      rawMarkRead(postId, feedId)
      if (feedId) {
        setPostsByFeed((current) => {
          // postsByFeed is keyed by feed.id (entity id); feedId here may be a
          // fingerprint (data-feed-id prefers fingerprint). Try direct lookup,
          // then walk current to find the bucket containing this post.
          let key = feedId
          let posts = current[key]
          if (!posts) {
            for (const k of Object.keys(current)) {
              if (current[k].some((p) => p.id === postId)) {
                key = k
                posts = current[k]
                break
              }
            }
          }
          if (!posts) return current
          const idx = posts.findIndex((p) => p.id === postId)
          if (idx === -1 || posts[idx].read) return current
          const updated = [...posts]
          updated[idx] = { ...updated[idx], read: Date.now() }
          return { ...current, [key]: updated }
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
  const sortOptions: SortType[] = useMemo(() => {
    const opts: SortType[] = []
    if (hasAi) opts.push('ai')
    opts.push('interests', 'new', 'hot', 'top')
    return opts
  }, [hasAi])

  const feedReadMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const feed of subscribedFeeds) m[feed.id] = feed.read ?? 0
    return m
  }, [subscribedFeeds])

  const filteredPosts = useMemo(
    () => readFilter === 'unread' ? allPosts.filter((p) => (p.read ?? 0) === 0 && (p.created ?? 0) > (feedReadMap[p.feedId] ?? 0)) : allPosts,
    [allPosts, readFilter, feedReadMap]
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
      currentUserId,
      currentUserName,
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
      return handleReplyToComment(feedId, postId, parentCommentId, body, files)
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
        toast.success(t`Interest boosted`)
      } catch (error) {
        toast.error(getErrorMessage(error, t`Failed to adjust interest`))
      }
    },
    [defaultFeedFp]
  )
  const handleInterestDown = useCallback(
    async (qidOrLabel: string, isLabel?: boolean) => {
      if (!defaultFeedFp) return
      try {
        await feedsApi.adjustTagInterest(defaultFeedFp, qidOrLabel, 'down', isLabel)
        toast.success(t`Interest reduced`)
      } catch (error) {
        toast.error(getErrorMessage(error, t`Failed to adjust interest`))
      }
    },
    [defaultFeedFp]
  )

  const handleInterestRemove = useCallback(
    async (qid: string) => {
      if (!defaultFeedFp) return
      try {
        await feedsApi.adjustTagInterest(defaultFeedFp, qid, 'remove')
        toast.success(t`Interest removed`)
      } catch (error) {
        toast.error(getErrorMessage(error, t`Failed to remove interest`))
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
        toast.error(getErrorMessage(error, t`Failed to add tag`))
        throw error
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
      toast.success(t`All marked as read`)
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to mark all as read`))
    }
  }, [subscribedFeeds, setUnread, setPostsByFeed])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  useEffect(() => {
    for (const feed of subscribedFeeds) {
      const cacheKey = `${feed.id}:${sort}:${readFilter}`
      if (!loadedThisSession.current.has(cacheKey)) {
        loadedThisSession.current.add(cacheKey)
        void loadPostsForFeed(feed.id, { sort, unread: readFilter === 'unread' ? '1' : undefined })
      }
    }
  }, [subscribedFeeds, loadPostsForFeed, sort, readFilter])

  return (
    <>
      <PageHeader
        title={t`Feeds`}
        icon={<Rss className='size-4 md:size-5' />}
        actions={
          <>
            {ownedFeeds.length > 0 && (
              <Button variant='ghost' size='sm' onClick={() => openNewPostDialog('')}>
                <SquarePen className='size-4 md:me-2' />
                <span className='hidden md:inline'><Trans><Trans>New post</Trans></Trans></span>
              </Button>
            )}
            {isLoggedIn && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='ghost' size='sm'>
                    {readFilter === 'unread' ? <EyeOff className='me-1 size-3.5' /> : <Eye className='me-1 size-3.5' />}
                    {readFilter === 'unread' ? <Trans><Trans>Unread</Trans></Trans> : <Trans><Trans>All</Trans></Trans>}
                    <ChevronDown className='ms-1 size-3' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onSelect={() => setReadFilter('all')}>
                    <Eye className='size-4' />
                    <Trans><Trans>All</Trans></Trans>
                    {readFilter === 'all' && <Check className='ms-auto size-3.5' />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setReadFilter('unread')}>
                    <EyeOff className='size-4' />
                    <Trans><Trans>Unread</Trans></Trans>
                    {readFilter === 'unread' && <Check className='ms-auto size-3.5' />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleMarkAllRead}>
                    <CheckCheck className='size-4' />
                    <Trans><Trans>Mark all read</Trans></Trans>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isLoggedIn && <SortSelector value={sort} onValueChange={setSort} options={sortOptions} />}
          </>
        }
        menuAction={<OptionsMenu showRss />}
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
                  title={t`Feeds`}
                  description={t`You have no feeds yet.`}
                  searchSlot={<InlineFeedSearch subscribedIds={subscribedFeedSearchIds} onRefresh={() => void refreshFeedsAndStore()} />}
                  primaryActionSlot={(
                    <Button variant="outline" onClick={openCreateFeedDialog}>
                      <Plus className="me-2 h-4 w-4" />
                      <Trans><Trans>Create a new feed</Trans></Trans>
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
                    title={readFilter === 'unread' ? "All caught up" : "No posts yet"}
                  >
                    {readFilter === 'unread' && (
                      <Button variant='outline' onClick={() => setReadFilter('all')}>
                        <Trans><Trans>View all posts</Trans></Trans>
                      </Button>
                    )}
                  </EmptyState>
                </div>
              ) : (
                <>
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
                  onInterestUp={handleInterestUp}
                  onInterestDown={handleInterestDown}
                  onInterestRemove={handleInterestRemove}
                  onPostClick={markRead}
                  observePost={observePost}
                  readLocally={readLocally}
                  showFeedName
                  currentUserId={currentUserId}
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
