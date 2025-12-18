import { useCallback } from 'react'
import feedsApi from '@/api/feeds'
import { createReactionCounts, STRINGS } from '@/features/feeds/constants'
import { applyReaction, randomId, updateCommentTree } from '@/features/feeds/utils'
import type { FeedComment, FeedPost, FeedSummary, ReactionId } from '@/types'
import type { LoadPostsOptions } from './use-feed-posts'
import { toast } from 'sonner'

export type UseCommentActionsOptions = {
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  setPostsByFeed: React.Dispatch<React.SetStateAction<Record<string, FeedPost[]>>>
  loadPostsForFeed: (feedId: string, options?: boolean | LoadPostsOptions) => Promise<void>
  loadedFeedsRef: React.MutableRefObject<Set<string>>
  commentDrafts: Record<string, string>
  setCommentDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>
  /** Whether the current feed is a remote (unsubscribed) feed */
  isRemoteFeed?: boolean
}

export type UseCommentActionsResult = {
  /** Add a top-level comment to a post */
  handleAddComment: (feedId: string, postId: string, body?: string) => void
  /** Reply to an existing comment */
  handleReplyToComment: (feedId: string, postId: string, parentCommentId: string, body: string) => void
  /** React to a comment */
  handleCommentReaction: (feedId: string, postId: string, commentId: string, reaction: ReactionId) => void
}

export function useCommentActions({
  setFeeds,
  setPostsByFeed,
  loadPostsForFeed,
  loadedFeedsRef,
  commentDrafts,
  setCommentDrafts,
  isRemoteFeed = false,
}: UseCommentActionsOptions): UseCommentActionsResult {

  const handleAddComment = useCallback((feedId: string, postId: string, body?: string) => {
    const draft = (body ?? commentDrafts[postId])?.trim()
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
      const posts = current[feedId] ?? []
      const updated = posts.map((post) =>
        post.id === postId
          ? { ...post, comments: [comment, ...post.comments] }
          : post
      )
      return { ...current, [feedId]: updated }
    })

    setFeeds((current) =>
      current.map((feed) =>
        feed.id === feedId ? { ...feed, lastActive: STRINGS.JUST_NOW } : feed
      )
    )

    setCommentDrafts((current) => ({ ...current, [postId]: '' }))

    // Clear the loaded feeds cache for this feed so it can be reloaded
    loadedFeedsRef.current.delete(feedId)

    void (async () => {
      try {
        // Use remote API for unsubscribed feeds
        if (isRemoteFeed) {
          await feedsApi.createCommentRemote(feedId, postId, draft)
        } else {
          await feedsApi.createComment({
            feed: feedId,
            post: postId,
            body: draft,
          })
        }
        await loadPostsForFeed(feedId, { forceRefresh: true, isRemote: isRemoteFeed })
      } catch (error) {
        console.error('[Feeds] Failed to create comment', error)
        toast.error(STRINGS.TOAST_COMMENT_FAILED)
      }
    })()
  }, [commentDrafts, setPostsByFeed, setFeeds, setCommentDrafts, loadedFeedsRef, loadPostsForFeed, isRemoteFeed])

  const handleReplyToComment = useCallback((feedId: string, postId: string, parentCommentId: string, body: string) => {
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
      const posts = current[feedId] ?? []
      const updated = posts.map((post) =>
        post.id === postId
          ? { ...post, comments: addReplyToComment(post.comments) }
          : post
      )
      return { ...current, [feedId]: updated }
    })

    setFeeds((current) =>
      current.map((feed) =>
        feed.id === feedId ? { ...feed, lastActive: STRINGS.JUST_NOW } : feed
      )
    )

    // Clear the loaded feeds cache for this feed so it can be reloaded
    loadedFeedsRef.current.delete(feedId)

    void (async () => {
      try {
        // Use remote API for unsubscribed feeds
        if (isRemoteFeed) {
          await feedsApi.createCommentRemote(feedId, postId, body, parentCommentId)
        } else {
          await feedsApi.createComment({
            feed: feedId,
            post: postId,
            body,
            parent: parentCommentId,
          })
        }
        await loadPostsForFeed(feedId, { forceRefresh: true, isRemote: isRemoteFeed })
      } catch (error) {
        console.error('[Feeds] Failed to create reply', error)
        toast.error(STRINGS.TOAST_REPLY_FAILED)
      }
    })()
  }, [setPostsByFeed, setFeeds, loadedFeedsRef, loadPostsForFeed, isRemoteFeed])

  const handleCommentReaction = useCallback((
    feedId: string,
    postId: string,
    commentId: string,
    reaction: ReactionId
  ) => {
    let nextReaction: ReactionId | null | undefined
    setPostsByFeed((current) => {
      const posts = current[feedId] ?? []
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
      return { ...current, [feedId]: updated }
    })

    // Only call API when setting an actual reaction, not when removing (empty string fails on backend)
    if (nextReaction) {
      // Use remote API for unsubscribed feeds
      const reactPromise = isRemoteFeed
        ? feedsApi.reactToCommentRemote(feedId, commentId, nextReaction)
        : feedsApi.reactToComment(feedId, postId, commentId, nextReaction)

      void reactPromise.catch((error) => {
        console.error('[Feeds] Failed to react to comment', error)
      })
    }
  }, [setPostsByFeed, isRemoteFeed])

  return {
    handleAddComment,
    handleReplyToComment,
    handleCommentReaction,
  }
}
