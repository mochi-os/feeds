import { useCallback } from 'react'
import { useLingui } from '@lingui/react/macro'
import { feedsApi } from '@/api/feeds'
import { createReactionCounts } from '@/features/feeds/constants'
import { applyReaction, randomId } from '@/features/feeds/utils'
import type { FeedPost, FeedSummary, PostData, ReactionId } from '@/types'
import { toast, getErrorMessage } from '@mochi/web'

export type UsePostActionsOptions = {
  selectedFeed: FeedSummary | null
  ownedFeeds: FeedSummary[]
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  setSelectedFeedId: React.Dispatch<React.SetStateAction<string | null>>
  setPostsByFeed: React.Dispatch<React.SetStateAction<Record<string, FeedPost[]>>>
  loadPostsForFeed: (feedId: string, forceRefresh?: boolean) => Promise<void>
  loadedFeedsRef: React.MutableRefObject<Set<string>>
  refreshFeedsFromApi: () => Promise<void>
}

export type UsePostActionsResult = {
  /** Create post via dialog (with optional file attachments and location data) */
  handleLegacyDialogPost: (params: { feedId: string; body: string; data?: PostData; files: File[] }) => void
  /** Create post via inline form */
  handleCreatePost: (feedId: string, body: string, files?: File[]) => void
  /** Create a new feed */
  handleCreateFeed: (params: { name: string; allowSearch: boolean }) => void
  /** React to a post */
  handlePostReaction: (feedId: string, postId: string, reaction: ReactionId | '') => void
}

export function usePostActions({
  selectedFeed: _selectedFeed,
  ownedFeeds,
  setFeeds,
  setSelectedFeedId,
  setPostsByFeed,
  loadPostsForFeed,
  loadedFeedsRef,
  refreshFeedsFromApi,
}: UsePostActionsOptions): UsePostActionsResult {
  const { t } = useLingui()

  const handleLegacyDialogPost = useCallback(({
    feedId,
    body,
    data,
    files,
  }: {
    feedId: string
    body: string
    data?: PostData
    files: File[]
  }) => {
    const targetFeed = ownedFeeds.find((feed) => feed.id === feedId)
    if (!targetFeed || !body.trim()) return

    const post: FeedPost = {
      id: randomId('post'),
      feedId: targetFeed.id,
      author: t`You`,
      role: t`Feed Owner`,
      created: Math.floor(Date.now() / 1000),
      body: body.trim(),
      data: data && Object.keys(data).length > 0 ? data : undefined,
      tags: [],
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
          ? { ...feed, unreadPosts: feed.unreadPosts + 1, lastActive: Math.floor(Date.now() / 1000) }
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
          data: data && Object.keys(data).length > 0 ? data : undefined,
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
        toast.error(getErrorMessage(error, t`Failed to create post. Please try again.`))
      }
    })()
  }, [t, ownedFeeds, setPostsByFeed, setFeeds, setSelectedFeedId, loadedFeedsRef, loadPostsForFeed])

  const handleCreatePost = useCallback((feedId: string, body: string, files?: File[]) => {
    const targetFeed = ownedFeeds.find((feed) => feed.id === feedId)
    if (!targetFeed || !body.trim()) return

    const bodyTrimmed = body.trim()

    const post: FeedPost = {
      id: randomId('post'),
      feedId: targetFeed.id,
      author: t`You`,
      role: t`Feed Owner`,
      created: Math.floor(Date.now() / 1000),
      body: bodyTrimmed,
      tags: [],
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
          ? { ...feed, unreadPosts: feed.unreadPosts + 1, lastActive: Math.floor(Date.now() / 1000) }
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
        toast.error(getErrorMessage(error, t`Failed to create post. Please try again.`))
      }
    })()
  }, [t, ownedFeeds, setPostsByFeed, setFeeds, loadedFeedsRef, loadPostsForFeed])

  const handleCreateFeed = useCallback(({ name, allowSearch }: { name: string; allowSearch: boolean }) => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    const feed: FeedSummary = {
      id: randomId('feed'),
      name: trimmedName,
      description: t`Share updates and decisions in one place.`,
      tags: [t`General`],
      owner: t`You`,
      subscribers: 1,
      unreadPosts: 0,
      lastActive: Math.floor(Date.now() / 1000),
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
        toast.error(getErrorMessage(error, t`Failed to create feed. Please try again.`))
      }
    })()
  }, [t, setFeeds, setSelectedFeedId, setPostsByFeed, refreshFeedsFromApi])

  const handlePostReaction = useCallback((feedId: string, postId: string, reaction: ReactionId | '') => {
    setPostsByFeed((current) => {
      const posts = current[feedId] ?? []
      const updated = posts.map((post) =>
        post.id === postId
          ? { ...post, ...applyReaction(post.reactions, post.userReaction, reaction) }
          : post
      )
      return { ...current, [feedId]: updated }
    })

    // Call API to set or remove reaction (empty string removes)
    void feedsApi.reactToPost(feedId, postId, reaction).catch((error) => {
      toast.error(getErrorMessage(error, t`Failed to update reaction`))
    })
  }, [t, setPostsByFeed])

  return {
    handleLegacyDialogPost,
    handleCreatePost,
    handleCreateFeed,
    handlePostReaction,
  }
}
