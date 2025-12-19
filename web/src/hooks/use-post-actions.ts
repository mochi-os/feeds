import { useCallback } from 'react'
import feedsApi from '@/api/feeds'
import { createReactionCounts, STRINGS } from '@/features/feeds/constants'
import { applyReaction, randomId } from '@/features/feeds/utils'
import type { FeedPost, FeedSummary, ReactionId } from '@/types'
import { toast } from 'sonner'

export type UsePostActionsOptions = {
  selectedFeed: FeedSummary | null
  ownedFeeds: FeedSummary[]
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  setSelectedFeedId: React.Dispatch<React.SetStateAction<string | null>>
  setPostsByFeed: React.Dispatch<React.SetStateAction<Record<string, FeedPost[]>>>
  loadPostsForFeed: (feedId: string, forceRefresh?: boolean) => Promise<void>
  loadedFeedsRef: React.MutableRefObject<Set<string>>
  refreshFeedsFromApi: () => Promise<void>
  /** Whether the current feed is a remote (unsubscribed) feed */
  isRemoteFeed?: boolean
}

export type UsePostActionsResult = {
  /** Create post via dialog (with optional file attachments) */
  handleLegacyDialogPost: (params: { feedId: string; body: string; files: File[] }) => void
  /** Create post via inline form */
  handleCreatePost: (feedId: string, body: string, files?: File[]) => void
  /** Create a new feed */
  handleCreateFeed: (params: { name: string; allowSearch: boolean }) => void
  /** React to a post */
  handlePostReaction: (postId: string, reaction: ReactionId) => void
}

export function usePostActions({
  selectedFeed,
  ownedFeeds,
  setFeeds,
  setSelectedFeedId,
  setPostsByFeed,
  loadPostsForFeed,
  loadedFeedsRef,
  refreshFeedsFromApi,
  isRemoteFeed = false,
}: UsePostActionsOptions): UsePostActionsResult {

  const handleLegacyDialogPost = useCallback(({
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
        const response = await feedsApi.createPost({
          feed: targetFeed.id,
          body: body.trim(),
          files,
        })

        // Update the optimistic post with the real ID from the backend immediately
        const realId = response?.data?.id || response?.data?.post
        
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
        toast.error(STRINGS.TOAST_POST_FAILED)
      }
    })()
  }, [ownedFeeds, setPostsByFeed, setFeeds, setSelectedFeedId, loadedFeedsRef, loadPostsForFeed])

  const handleCreatePost = useCallback((feedId: string, body: string, files?: File[]) => {
    const targetFeed = ownedFeeds.find((feed) => feed.id === feedId)
    if (!targetFeed || !body.trim()) return

    // Derive title from the first line of the body
    const bodyTrimmed = body.trim()
    const firstLine = bodyTrimmed.split('\n')[0]
    const derivedTitle = firstLine.slice(0, 120) + (firstLine.length > 120 ? '…' : '')

    const post: FeedPost = {
      id: randomId('post'),
      feedId: targetFeed.id,
      title: derivedTitle || STRINGS.FEED_UPDATE,
      author: STRINGS.AUTHOR_YOU,
      role: STRINGS.AUTHOR_FEED_OWNER,
      createdAt: STRINGS.JUST_NOW,
      body: bodyTrimmed,
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

    // Clear the loaded feeds cache for this feed so it can be reloaded
    loadedFeedsRef.current.delete(targetFeed.id)

    void (async () => {
      try {
        const response = await feedsApi.createPost({
          feed: targetFeed.id,
          body: bodyTrimmed,
          files,
        })
        
        // Update the optimistic post with the real ID from the backend immediately
        const realId = response.data.id || response.data.post
        
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
        console.error('[Feeds] Failed to create post', error)
        toast.error(STRINGS.TOAST_POST_FAILED)
      }
    })()
  }, [ownedFeeds, setPostsByFeed, setFeeds, loadedFeedsRef, loadPostsForFeed])

  const handleCreateFeed = useCallback(({ name, allowSearch }: { name: string; allowSearch: boolean }) => {
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
        toast.error(STRINGS.TOAST_FEED_FAILED)
      }
    })()
  }, [setFeeds, setSelectedFeedId, setPostsByFeed, refreshFeedsFromApi])

  const handlePostReaction = useCallback((postId: string, reaction: ReactionId) => {
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

    // Only call API when setting an actual reaction, not when removing (empty string fails on backend)
    if (nextReaction) {
      // Use remote API for unsubscribed feeds
      const reactPromise = isRemoteFeed
        ? feedsApi.reactToPostRemote(selectedFeed.id, postId, nextReaction)
        : feedsApi.reactToPost(selectedFeed.id, postId, nextReaction)

      void reactPromise.catch((error) => {
        console.error('[Feeds] Failed to react to post', error)
      })
    }
  }, [selectedFeed, setPostsByFeed, isRemoteFeed])

  return {
    handleLegacyDialogPost,
    handleCreatePost,
    handleCreateFeed,
    handlePostReaction,
  }
}
