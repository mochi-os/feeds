import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Rss } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import feedsApi from '@/api/feeds'

import { Main } from '@/components/layout/main'

import { FeedDirectory } from './components/feed-directory'
import { FeedDetail } from './components/feed-detail'
import { NewPostDialog } from './components/new-post-dialog'
import { CreateFeedDialog } from './components/create-feed-dialog'
import { createReactionCounts, STRINGS } from './constants'
import { mapFeedsToSummaries, mapPosts } from './api/adapters'
import {
  applyReaction,
  countComments,
  countReactions,
  randomId,
  sumCommentReactions,
  updateCommentTree,
} from './utils'
import { type FeedComment, type FeedPost, type FeedSummary, type ReactionId } from './types'
import type { Feed } from '@/api/types/feeds'

const groupPostsByFeed = (posts: FeedPost[]): Record<string, FeedPost[]> => {
  return posts.reduce<Record<string, FeedPost[]>>((acc, post) => {
    acc[post.feedId] = acc[post.feedId] ? [...acc[post.feedId], post] : [post]
    return acc
  }, {})
}

export function Feeds() {
  const [feeds, setFeeds] = useState<FeedSummary[]>([])
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [newPostForm, setNewPostForm] = useState({ body: '' })
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false)
  const [loadingFeedId, setLoadingFeedId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refreshFeedsFromApi = useCallback(async () => {
    setIsLoadingFeeds(true)
    try {
      const response = await feedsApi.view()
      if (!mountedRef.current) {
        return
      }
      const data = response.data ?? {}
      // Create a set of subscribed feed IDs from the feeds array
      const subscribedFeedIds = new Set(data.feeds?.map((feed) => feed.id) ?? [])
      const mappedFeeds = mapFeedsToSummaries(data.feeds, subscribedFeedIds)
      // Only map feed if it has an id (it might be a minimal object with only name)
      const currentFeedSummary =
        data.feed && 'id' in data.feed && data.feed.id
          ? mapFeedsToSummaries([data.feed as Feed], subscribedFeedIds)[0]
          : undefined
      const dedupedFeeds = [
        ...(currentFeedSummary ? [currentFeedSummary] : []),
        ...mappedFeeds,
      ].reduce<FeedSummary[]>((acc, feed) => {
        if (!acc.some((item) => item.id === feed.id)) {
          acc.push(feed)
        }
        return acc
      }, [])
      setFeeds(dedupedFeeds)
      setSelectedFeedId((current) => {
        if (current && dedupedFeeds.some((feed) => feed.id === current)) {
          return current
        }
        return dedupedFeeds[0]?.id ?? null
      })
      const mappedPosts = mapPosts(data.posts)
      const grouped = groupPostsByFeed(mappedPosts)
      setPostsByFeed(grouped)
      setErrorMessage(null)
    } catch (error) {
      if (!mountedRef.current) {
        return
      }
      console.error('[Feeds] Failed to load feeds', error)
      setErrorMessage(STRINGS.ERROR_SYNC_FAILED)
    } finally {
      if (mountedRef.current) {
        setIsLoadingFeeds(false)
      }
    }
  }, [])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  const loadPostsForFeed = useCallback(async (feedId: string, forceRefresh = false) => {
    setLoadingFeedId(feedId)
    try {
      const response = await feedsApi.get(feedId, forceRefresh ? { _t: Date.now() } : undefined)
      if (!mountedRef.current) {
        return
      }
      const data = response.data ?? {}
      const mappedPosts = mapPosts(data.posts)
      
      // Only update posts if the API returned data, to avoid clearing optimistic updates
      // when the backend hasn't synced the new post yet
      setPostsByFeed((current) => {
        const existingPosts = current[feedId] ?? []
        
        // If API returned posts, use them (they should include the new post)
        if (mappedPosts.length > 0) {
          return { ...current, [feedId]: mappedPosts }
        }
        
        // If API returned empty but we have optimistic posts, keep them
        // This handles the case where backend is slow to sync
        if (existingPosts.length > 0) {
          console.log('[Feeds] API returned empty posts, preserving existing optimistic posts')
          return current
        }
        
        // Otherwise, set to empty (truly no posts)
        return { ...current, [feedId]: mappedPosts }
      })
      setErrorMessage(null)
    } catch (error) {
      if (!mountedRef.current) {
        return
      }
      console.error('[Feeds] Failed to load posts', error)
      setErrorMessage(STRINGS.ERROR_LOAD_POSTS_FAILED)
    } finally {
      if (mountedRef.current) {
        setLoadingFeedId((current) => (current === feedId ? null : current))
      }
    }
  }, [])

  // Track feeds that have been loaded to avoid infinite loops
  const loadedFeedsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!selectedFeedId) {
      return
    }
    // Skip if this feed was already loaded (from initial load or explicit load)
    if (loadedFeedsRef.current.has(selectedFeedId)) {
      return
    }
    // Only load posts for feeds that don't have any posts from the initial load
    // The postsByFeed check is done outside the effect trigger
    const hasPosts = Boolean(postsByFeed[selectedFeedId]?.length)
    if (hasPosts) {
      loadedFeedsRef.current.add(selectedFeedId)
      return
    }
    loadedFeedsRef.current.add(selectedFeedId)
    void loadPostsForFeed(selectedFeedId)
  }, [selectedFeedId, loadPostsForFeed])

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

  const toggleSubscription = useCallback(
    async (feedId: string) => {
      console.log('[Feeds] toggleSubscription called', { feedId, feedsCount: feeds.length })

      // Validate feedId is not undefined or empty
      if (!feedId) {
        console.error('[Feeds] Cannot toggle subscription: feedId is undefined or empty')
        return
      }

      const targetFeed = feeds.find((feed) => feed.id === feedId)
      console.log('[Feeds] Target feed found:', {
        found: !!targetFeed,
        feedId,
        targetFeed: targetFeed ? {
          id: targetFeed.id,
          name: targetFeed.name,
          isOwner: targetFeed.isOwner,
          isSubscribed: targetFeed.isSubscribed,
        } : null,
      })

      // Allow subscription even if feed is not in feeds array (e.g., from search results)
      // Only block if feed exists and is owned by user
      if (targetFeed && targetFeed.isOwner) {
        console.log('[Feeds] Subscription blocked: feed is owned by user', { feedId })
        return
      }

      const wasSubscribed = targetFeed?.isSubscribed ?? false
      const originalSubscribers = targetFeed?.subscribers ?? 0

      console.log('[Feeds] Subscription state:', {
        feedId,
        wasSubscribed,
        originalSubscribers,
        willSubscribe: !wasSubscribed,
      })

      // Optimistic update - add feed to list if it doesn't exist
      setFeeds((current) => {
        const existingFeed = current.find((feed) => feed.id === feedId)
        if (existingFeed) {
          // Update existing feed
          return current.map((feed) => {
            if (feed.id !== feedId) return feed
            const isSubscribed = !feed.isSubscribed
            const subscribers = Math.max(
              0,
              originalSubscribers + (isSubscribed ? 1 : -1)
            )
            return { ...feed, isSubscribed, subscribers }
          })
        } else {
          // Add new feed from search results
          const isSubscribed = !wasSubscribed
          const subscribers = Math.max(0, originalSubscribers + (isSubscribed ? 1 : -1))
          console.log('[Feeds] Adding new feed to list (from search results)', {
            feedId,
            isSubscribed,
            subscribers,
          })
          return [
            ...current,
            {
              id: feedId,
              name: STRINGS.LOADING_PLACEHOLDER,
              description: '',
              tags: [],
              owner: STRINGS.AUTHOR_SUBSCRIBED_FEED,
              subscribers,
              unreadPosts: 0,
              lastActive: STRINGS.RECENTLY_ACTIVE,
              isSubscribed,
              isOwner: false,
            },
          ]
        }
      })

      try {
        console.log('[Feeds] Calling API:', {
          action: wasSubscribed ? 'unsubscribe' : 'subscribe',
          feedId,
        })

        const response = wasSubscribed
          ? await feedsApi.unsubscribe(feedId)
          : await feedsApi.subscribe(feedId)

        console.log('[Feeds] API response received:', {
          action: wasSubscribed ? 'unsubscribe' : 'subscribe',
          response,
        })

        if (!mountedRef.current) {
          return
        }

        // Response is minimal (success/fingerprint), so we trust our optimistic update
        // and trigger a background refresh to ensure consistency (e.g. subscriber counts)
        void refreshFeedsFromApi()

        setErrorMessage(null)
        console.log('[Feeds] Subscription toggle completed successfully', {
          feedId,
          wasSubscribed,
          nowSubscribed: !wasSubscribed,
        })

        // Show success toast notification
        const { toast } = await import('sonner')
        const feedName = targetFeed?.name || 'Feed'
        if (wasSubscribed) {
          toast.success(STRINGS.TOAST_UNSUBSCRIBED(feedName))
        } else {
          toast.success(STRINGS.TOAST_SUBSCRIBED(feedName))
        }
      } catch (error) {
        if (!mountedRef.current) {
          return
        }
        console.error('[Feeds] Failed to toggle subscription', {
          feedId,
          error,
          wasSubscribed,
          originalSubscribers,
        })
        // Revert optimistic update on error
        setFeeds((current) =>
          current.map((feed) =>
            feed.id === feedId
              ? {
                ...feed,
                isSubscribed: wasSubscribed,
                subscribers: originalSubscribers,
              }
              : feed
          )
        )
        setErrorMessage(STRINGS.ERROR_SUBSCRIPTION_FAILED)

        // Show error toast notification
        const { toast } = await import('sonner')
        const feedName = targetFeed?.name || 'Feed'
        if (wasSubscribed) {
          toast.error(STRINGS.TOAST_UNSUBSCRIBE_FAILED(feedName))
        } else {
          toast.error(STRINGS.TOAST_SUBSCRIBE_FAILED(feedName))
        }
      }
    },
    [feeds, refreshFeedsFromApi]
  )

  const handleLegacyDialogPost = ({
    feedId,
    body,
    files,
  }: {
    feedId: string
    body: string
    files: File[]
  }) => {
    const targetFeed = ownedFeeds.find((feed) => feed.id === feedId)
    if (!targetFeed || !body.trim()) return

    const post: FeedPost = {
      id: randomId('post'),
      feedId: targetFeed.id,
      title: `${targetFeed.name} update`,
      author: STRINGS.AUTHOR_YOU,
      role: STRINGS.AUTHOR_FEED_OWNER,
      createdAt: STRINGS.JUST_NOW,
      body: body.trim(),
      tags: targetFeed.tags.slice(0, 1),
      reactions: createReactionCounts(),
      userReaction: null,
      comments: [],
    }

    setPostsByFeed((current) => ({
      ...current,
      [targetFeed.id]: [post, ...(current[targetFeed.id] ?? [])],
    }))

    setFeeds((current) =>
      current.map((feed) =>
        feed.id === targetFeed.id
          ? { ...feed, unreadPosts: feed.unreadPosts + 1, lastActive: STRINGS.JUST_NOW }
          : feed
      )
    )

    setSelectedFeedId(targetFeed.id)

    // Clear the loaded feeds cache for this feed so it can be reloaded
    loadedFeedsRef.current.delete(targetFeed.id)

    void (async () => {
      try {
        let response
        // Use global endpoint for files, specific endpoint for JSON-only
        if (files.length > 0) {
          response = await feedsApi.createPost({
            feed: targetFeed.id,
            body: body.trim(),
            files,
          })
        } else {
          response = await feedsApi.createPostInFeed(targetFeed.id, body.trim())
        }

        // Update the optimistic post with the real ID from the backend immediately
        const realId = response?.data?.id || (response?.data as any)?.post
        
        if (realId) {
          setPostsByFeed((current) => {
            const posts = current[targetFeed.id] ?? []
            const updated = posts.map((p) => 
              p.id === post.id ? { ...p, id: realId } : p
            )
            return { ...current, [targetFeed.id]: updated }
          })
        }

        await loadPostsForFeed(targetFeed.id, true)
      } catch (error) {
        console.error('[Feeds] Failed to publish post', error)
      }
    })()
  }

  const handleCreateFeed = ({ name, allowSearch }: { name: string; allowSearch: boolean }) => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    const feed: FeedSummary = {
      id: randomId('feed'),
      name: trimmedName,
      description: STRINGS.DEFAULT_FEED_DESCRIPTION,
      tags: [STRINGS.DEFAULT_TAG],
      owner: STRINGS.AUTHOR_YOU,
      subscribers: 1,
      unreadPosts: 0,
      lastActive: STRINGS.JUST_NOW,
      isSubscribed: true,
      allowSearch,
      isOwner: true,
    }

    setFeeds((current) => [feed, ...current])
    setSelectedFeedId(feed.id)
    setPostsByFeed((current) => ({ ...current, [feed.id]: [] }))

    void (async () => {
      try {
        await feedsApi.create({
          name: trimmedName,
          privacy: allowSearch ? 'public' : 'private',
        })
        await refreshFeedsFromApi()
      } catch (error) {
        console.error('[Feeds] Failed to create feed', error)
      }
    })()
  }

  const handleCreatePost = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFeed || !selectedFeed.isOwner || !newPostForm.body.trim()) return

    // Derive title from the first line of the body
    const bodyTrimmed = newPostForm.body.trim()
    const firstLine = bodyTrimmed.split('\n')[0]
    const derivedTitle = firstLine.slice(0, 120) + (firstLine.length > 120 ? '…' : '')

    const post: FeedPost = {
      id: randomId('post'),
      feedId: selectedFeed.id,
      title: derivedTitle || STRINGS.FEED_UPDATE,
      author: STRINGS.AUTHOR_YOU,
      role: STRINGS.AUTHOR_FEED_OWNER,
      createdAt: STRINGS.JUST_NOW,
      body: bodyTrimmed,
      tags: selectedFeed.tags.slice(0, 1),
      reactions: createReactionCounts(),
      userReaction: null,
      comments: [],
    }

    setPostsByFeed((current) => ({
      ...current,
      [selectedFeed.id]: [post, ...(current[selectedFeed.id] ?? [])],
    }))

    setFeeds((current) =>
      current.map((feed) =>
        feed.id === selectedFeed.id
          ? { ...feed, unreadPosts: feed.unreadPosts + 1, lastActive: STRINGS.JUST_NOW }
          : feed
      )
    )

    // Clear the loaded feeds cache for this feed so it can be reloaded
    loadedFeedsRef.current.delete(selectedFeed.id)

    void (async () => {
      try {
        // Use the specific feed endpoint (/feeds/{feed}/create) with JSON body
        const response = await feedsApi.createPostInFeed(selectedFeed.id, bodyTrimmed)
        
        // Update the optimistic post with the real ID from the backend immediately
        // This ensures that if the user reacts before the refresh completes, it uses the valid ID
        // Note: checking both 'id' and 'post' properties to accept either convention
        const realId = response.data.id || (response.data as any).post
        
        if (realId) {
          setPostsByFeed((current) => {
            const posts = current[selectedFeed.id] ?? []
            // Replace the temp ID with the real one
            const updated = posts.map((p) => 
              p.id === post.id ? { ...p, id: realId } : p
            )
            return { ...current, [selectedFeed.id]: updated }
          })
        }
        
        await loadPostsForFeed(selectedFeed.id, true)
      } catch (error) {
        console.error('[Feeds] Failed to create post', error)
      }
    })()

    setNewPostForm({ body: '' })
  }

  const handleAddComment = (postId: string) => {
    if (!selectedFeed) return
    const draft = commentDrafts[postId]?.trim()
    if (!draft) return

    const comment: FeedComment = {
      id: randomId('comment'),
      author: STRINGS.AUTHOR_YOU,
      createdAt: STRINGS.JUST_NOW,
      body: draft,
      reactions: createReactionCounts(),
      userReaction: null,
      replies: [],
    }

    setPostsByFeed((current) => {
      const posts = current[selectedFeed.id] ?? []
      const updated = posts.map((post) =>
        post.id === postId
          ? { ...post, comments: [comment, ...post.comments] }
          : post
      )
      return { ...current, [selectedFeed.id]: updated }
    })

    setFeeds((current) =>
      current.map((feed) =>
        feed.id === selectedFeed.id ? { ...feed, lastActive: STRINGS.JUST_NOW } : feed
      )
    )

    setCommentDrafts((current) => ({ ...current, [postId]: '' }))

    // Clear the loaded feeds cache for this feed so it can be reloaded
    loadedFeedsRef.current.delete(selectedFeed.id)

    void (async () => {
      try {
        await feedsApi.createComment({
          feed: selectedFeed.id,
          post: postId,
          body: draft,
        })
        await loadPostsForFeed(selectedFeed.id, true)
      } catch (error) {
        console.error('[Feeds] Failed to create comment', error)
      }
    })()
  }

  const handleReplyToComment = (postId: string, parentCommentId: string, body: string) => {
    if (!selectedFeed) return

    const reply: FeedComment = {
      id: randomId('reply'),
      author: STRINGS.AUTHOR_YOU,
      createdAt: STRINGS.JUST_NOW,
      body,
      reactions: createReactionCounts(),
      userReaction: null,
      replies: [],
    }

    // Helper to recursively add reply to the correct comment
    const addReplyToComment = (comments: FeedComment[]): FeedComment[] => {
      return comments.map((comment) => {
        if (comment.id === parentCommentId) {
          return { ...comment, replies: [...(comment.replies ?? []), reply] }
        }
        if (comment.replies?.length) {
          return { ...comment, replies: addReplyToComment(comment.replies) }
        }
        return comment
      })
    }

    setPostsByFeed((current) => {
      const posts = current[selectedFeed.id] ?? []
      const updated = posts.map((post) =>
        post.id === postId
          ? { ...post, comments: addReplyToComment(post.comments) }
          : post
      )
      return { ...current, [selectedFeed.id]: updated }
    })

    setFeeds((current) =>
      current.map((feed) =>
        feed.id === selectedFeed.id ? { ...feed, lastActive: STRINGS.JUST_NOW } : feed
      )
    )

    // Clear the loaded feeds cache for this feed so it can be reloaded
    loadedFeedsRef.current.delete(selectedFeed.id)

    void (async () => {
      try {
        await feedsApi.createComment({
          feed: selectedFeed.id,
          post: postId,
          body,
          parent: parentCommentId,
        })
        await loadPostsForFeed(selectedFeed.id, true)
      } catch (error) {
        console.error('[Feeds] Failed to create reply', error)
      }
    })()
  }

  const handlePostReaction = (postId: string, reaction: ReactionId) => {
    if (!selectedFeed) return
    let nextReaction: ReactionId | null | undefined
    setPostsByFeed((current) => {
      const posts = current[selectedFeed.id] ?? []
      const updated = posts.map((post) =>
        post.id === postId
          ? (() => {
            const outcome = applyReaction(post.reactions, post.userReaction, reaction)
            nextReaction = outcome.userReaction ?? null
            return { ...post, ...outcome }
          })()
          : post
      )
      return { ...current, [selectedFeed.id]: updated }
    })

    if (nextReaction !== undefined) {
      const payload = nextReaction ?? ''
      // Use fingerprint if available (required by backend for reactions), otherwise fallback to ID
      const feedIdOrFingerprint = selectedFeed.fingerprint || selectedFeed.id
      void feedsApi
        .reactToPost({ feed: feedIdOrFingerprint, post: postId, reaction: payload })
        .catch((error) => {
          console.error('[Feeds] Failed to react to post', error)
        })
    }
  }

  const handleCommentReaction = (
    postId: string,
    commentId: string,
    reaction: ReactionId
  ) => {
    if (!selectedFeed) return
    let nextReaction: ReactionId | null | undefined
    setPostsByFeed((current) => {
      const posts = current[selectedFeed.id] ?? []
      const updated = posts.map((post) => {
        if (post.id !== postId) return post
        const comments = updateCommentTree(post.comments, commentId, (comment) => ({
          ...comment,
          ...(() => {
            const outcome = applyReaction(comment.reactions, comment.userReaction, reaction)
            nextReaction = outcome.userReaction ?? null
            return outcome
          })(),
        }))
        return { ...post, comments }
      })
      return { ...current, [selectedFeed.id]: updated }
    })

    if (nextReaction !== undefined) {
      const payload = nextReaction ?? ''
      // Use fingerprint if available (required by backend for reactions), otherwise fallback to ID
      const feedIdOrFingerprint = selectedFeed.fingerprint || selectedFeed.id
      void feedsApi
        .reactToComment({
          feed: feedIdOrFingerprint,
          post: postId,
          comment: commentId,
          reaction: payload,
        })
        .catch((error) => {
          console.error('[Feeds] Failed to react to comment', error)
        })
    }
  }

  return (
    <>

      <Main className='space-y-6 pb-10'>
        {errorMessage ? (
          <Card className='border-destructive/30 bg-destructive/5 shadow-none'>
            <CardContent className='p-4 text-sm text-destructive'>{errorMessage}</CardContent>
          </Card>
        ) : null}
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-bold tracking-tight'>{STRINGS.PAGE_TITLE}</h1>
            <p className='text-sm text-muted-foreground'>
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
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
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
                onSubmitPost={handleCreatePost}
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
