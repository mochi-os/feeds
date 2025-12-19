import { Rss } from 'lucide-react'
import { Card, CardContent, Main } from '@mochi/common'

import { FeedDirectory } from './components/feed-directory'
import { FeedDetail } from './components/feed-detail'
import { NewPostDialog } from './components/new-post-dialog'
import { CreateFeedDialog } from './components/create-feed-dialog'
import { STRINGS } from './constants'
import { countComments, countReactions, sumCommentReactions, mapDirectoryEntryToFeedSummary } from './utils'
import { type FeedPost, type FeedSummary } from './types'
import feedsApi from '@/api/feeds'
import {
  useFeeds,
  useFeedPosts,
  useSubscription,
  usePostActions,
  useCommentActions,
} from './hooks'

import { useEffect, useMemo, useState, useRef } from 'react'

const SEARCH_DEBOUNCE_MS = 500

export function Feeds() {
  // ============================================================================
  // Hooks for state management
  // ============================================================================
  
  // Posts state - needs to be declared first so we can pass setter to useFeeds
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  
  // Feeds state with callback to sync posts on initial load
  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    errorMessage,
    setErrorMessage,
    refreshFeedsFromApi,
    selectedFeedId,
    setSelectedFeedId,
    mountedRef,
  } = useFeeds({
    onPostsLoaded: setPostsByFeed,
  })
  
  // Posts loading (uses external postsByFeed state for coordination)
  const {
    loadingFeedId,
    loadPostsForFeed,
    loadedFeedsRef,
  } = useFeedPosts({
    setErrorMessage,
    postsByFeed,
    setPostsByFeed,
  })
  
  // Subscription toggle
  const { toggleSubscription } = useSubscription({
    feeds,
    setFeeds,
    setErrorMessage,
    refreshFeedsFromApi,
    mountedRef,
  })

  // ============================================================================
  // Local UI state (forms, drafts)
  // ============================================================================
  
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<FeedSummary[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [newPostForm, setNewPostForm] = useState({ body: '' })
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})

  // ============================================================================
  // Derived state (computed before action hooks that depend on them)
  // ============================================================================

  const selectedFeed = useMemo(
    () => feeds.find((feed) => feed.id === selectedFeedId) ?? null,
    [feeds, selectedFeedId]
  )

  const ownedFeeds = useMemo(
    () => feeds.filter((feed) => Boolean(feed.isOwner)),
    [feeds]
  )

  const selectedFeedPosts = useMemo(() => {
    if (!selectedFeed) return []
    return postsByFeed[selectedFeed.id] ?? []
  }, [postsByFeed, selectedFeed])

  const totalComments = useMemo(
    () => selectedFeedPosts.reduce((acc, post) => acc + countComments(post.comments), 0),
    [selectedFeedPosts]
  )

  const totalReactions = useMemo(
    () =>
      selectedFeedPosts.reduce(
        (acc, post) => acc + countReactions(post.reactions) + sumCommentReactions(post.comments),
        0
      ),
    [selectedFeedPosts]
  )

  const isSelectedFeedLoading = selectedFeed ? loadingFeedId === selectedFeed.id : false

  // ============================================================================
  // Action Hooks (depend on derived state)
  // ============================================================================

  const {
    handleLegacyDialogPost,
    handleCreatePost,
    handleCreateFeed,
    handlePostReaction,
  } = usePostActions({
    selectedFeed,
    ownedFeeds,
    setFeeds,
    setSelectedFeedId,
    setPostsByFeed,
    loadPostsForFeed,
    loadedFeedsRef,
    refreshFeedsFromApi,
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
  })

  // ============================================================================
  // Effects
  // ============================================================================
  
  // Initial load
  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  // Load posts when selecting a feed that doesn't have posts yet
  useEffect(() => {
    if (!selectedFeedId) {
      return
    }
    // Skip if this feed was already loaded (from initial load or explicit load)
    if (loadedFeedsRef.current.has(selectedFeedId)) {
      return
    }
    // Only load posts for feeds that don't have any posts from the initial load
    const hasPosts = Boolean(postsByFeed[selectedFeedId]?.length)
    if (hasPosts) {
      loadedFeedsRef.current.add(selectedFeedId)
      return
    }
    loadedFeedsRef.current.add(selectedFeedId)
    void loadPostsForFeed(selectedFeedId)
  }, [selectedFeedId, loadPostsForFeed, postsByFeed, loadedFeedsRef])

  // Search effect with debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    const trimmedSearch = searchTerm.trim()

    if (!trimmedSearch) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    debounceTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return

      try {
        const response = await feedsApi.search({ search: trimmedSearch })
        if (!mountedRef.current) return

        const mappedResults = (response.data ?? []).map(mapDirectoryEntryToFeedSummary)
        setSearchResults(mappedResults)
      } catch (error) {
        console.error('[Feeds] Failed to search feeds', error)
        setSearchResults([])
      } finally {
        if (mountedRef.current) {
          setIsSearching(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchTerm, mountedRef])

  // Sync search results with main feeds state when feeds are updated
  useEffect(() => {
    if (feeds.length === 0) {
      return
    }

    setSearchResults((current) => {
      if (current.length === 0) return current

      let hasChanges = false
      const updated = current.map((searchFeed) => {
        const updatedFeed = feeds.find((feed) => {
          const matchesId = feed.id === searchFeed.id
          const matchesFingerprint =
            feed.fingerprint &&
            searchFeed.fingerprint &&
            feed.fingerprint === searchFeed.fingerprint
          return matchesId || matchesFingerprint
        })

        if (updatedFeed) {
          if (
            searchFeed.isSubscribed !== updatedFeed.isSubscribed ||
            searchFeed.subscribers !== updatedFeed.subscribers ||
            searchFeed.isOwner !== updatedFeed.isOwner
          ) {
            hasChanges = true
            return {
              ...searchFeed,
              isSubscribed: updatedFeed.isSubscribed,
              subscribers: updatedFeed.subscribers,
              isOwner: updatedFeed.isOwner,
            }
          }
        }
        return searchFeed
      })

      return hasChanges ? updated : current
    })
  }, [feeds])

  // ============================================================================
  // Inline Form Handler (wraps hook function with form reset)
  // ============================================================================
  
  const onSubmitPost = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFeed || !selectedFeed.isOwner || !newPostForm.body.trim()) return
    handleCreatePost(selectedFeed.id, newPostForm.body)
    setNewPostForm({ body: '' })
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>

      <Main fluid className='space-y-6 pb-10'>
        {errorMessage ? (
          <Card className='border-destructive/30 bg-destructive/5 shadow-none'>
            <CardContent className='p-4 text-sm text-destructive'>{errorMessage}</CardContent>
          </Card>
        ) : null}
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>{STRINGS.PAGE_TITLE}</h1>
          <p className='text-sm text-muted-foreground hidden lg:block'>
            {STRINGS.PAGE_DESCRIPTION}
          </p>
          {isLoadingFeeds ? (
            <p className='text-xs text-muted-foreground'>{STRINGS.SYNCING_MESSAGE}</p>
          ) : null}
        </div>
        <div className='flex items-center gap-2'>
          {ownedFeeds.length > 0 ? (
            <NewPostDialog feeds={ownedFeeds} onSubmit={handleLegacyDialogPost} />
          ) : null}
          <CreateFeedDialog onCreate={handleCreateFeed} />
        </div>
      </div>

        <div className='grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]'>
        <div className='h-[calc(100vh-2rem)] lg:sticky lg:top-4'>
          <FeedDirectory
            feeds={feeds}
            searchResults={searchResults}
            isSearching={isSearching}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            selectedFeedId={selectedFeed?.id ?? null}
            onSelectFeed={(feedId) => setSelectedFeedId(feedId)}
            onToggleSubscription={toggleSubscription}
          />
        </div>

          <section className='min-w-0 space-y-6'>
            {selectedFeed ? (
              <FeedDetail
                feed={selectedFeed}
                posts={selectedFeedPosts}
                totalComments={totalComments}
                totalReactions={totalReactions}
                isLoadingPosts={isSelectedFeedLoading}
                canCompose={Boolean(selectedFeed.isOwner)}
                composer={newPostForm}
                onBodyChange={(value) =>
                  setNewPostForm((prev) => ({ ...prev, body: value }))
                }
                onSubmitPost={onSubmitPost}
                commentDrafts={commentDrafts}
                onDraftChange={(postId, value) =>
                  setCommentDrafts((prev) => ({ ...prev, [postId]: value }))
                }
                onAddComment={handleAddComment}
                onReplyToComment={handleReplyToComment}
                onPostReaction={handlePostReaction}
                onCommentReaction={handleCommentReaction}
                onToggleSubscription={toggleSubscription}
              />
            ) : (
              <Card className='shadow-md'>
                <CardContent className='flex flex-col items-center justify-center space-y-3 p-12 text-center'>
                  <div className='rounded-full bg-primary/10 p-4'>
                    <Rss className='size-10 text-primary' />
                  </div>
                  <p className='text-sm font-semibold'>{STRINGS.SELECT_FEED_TITLE}</p>
                  <p className='text-sm text-muted-foreground'>{STRINGS.SELECT_FEED_DESCRIPTION}</p>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </Main>
    </>
  )
}
