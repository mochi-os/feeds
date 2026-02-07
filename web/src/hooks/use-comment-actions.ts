import { useCallback } from 'react'
import feedsApi from '@/api/feeds'
import { createReactionCounts, STRINGS } from '@/features/feeds/constants'
import { applyReaction, randomId, updateCommentTree } from '@/features/feeds/utils'
import type { FeedComment, FeedPost, FeedSummary, ReactionId } from '@/types'

import { toast } from '@mochi/common'

export type UseCommentActionsOptions = {
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  setPostsByFeed: React.Dispatch<React.SetStateAction<Record<string, FeedPost[]>>>
  loadedFeedsRef: { current: Set<string> }
  commentDrafts: Record<string, string>
  setCommentDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>
  loadPostsForFeed?: (feedId: string, options?: boolean | { forceRefresh?: boolean }) => Promise<void>
}

export type UseCommentActionsResult = {
  /** Add a top-level comment to a post */
  handleAddComment: (feedId: string, postId: string, body?: string, files?: File[]) => void
  /** Reply to an existing comment */
  handleReplyToComment: (feedId: string, postId: string, parentCommentId: string, body: string, files?: File[]) => void
  /** React to a comment */
  handleCommentReaction: (feedId: string, postId: string, commentId: string, reaction: ReactionId | '') => void
}

export function useCommentActions({
  setFeeds,
  setPostsByFeed,

  loadedFeedsRef,
  commentDrafts,
  setCommentDrafts,
  loadPostsForFeed,
}: UseCommentActionsOptions): UseCommentActionsResult {

  const handleAddComment = useCallback((feedId: string, postId: string, body?: string, files?: File[]) => {
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
        // Unified endpoint handles both local and remote feeds
        await feedsApi.createComment({
          feed: feedId,
          post: postId,
          body: draft,
          id: comment.id,
          files,
        })
        // Refetch to show server-saved attachments
        if (files?.length && loadPostsForFeed) {
          await loadPostsForFeed(feedId, { forceRefresh: true })
        }
      } catch {

        toast.error(STRINGS.TOAST_COMMENT_FAILED)
      }
    })()
  }, [commentDrafts, setPostsByFeed, setFeeds, setCommentDrafts, loadedFeedsRef, loadPostsForFeed])

  const handleReplyToComment = useCallback((feedId: string, postId: string, parentCommentId: string, body: string, files?: File[]) => {
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
        // Unified endpoint handles both local and remote feeds
        await feedsApi.createComment({
          feed: feedId,
          post: postId,
          body,
          parent: parentCommentId,
          id: reply.id,
          files,
        })
        // Refetch to show server-saved attachments
        if (files?.length && loadPostsForFeed) {
          await loadPostsForFeed(feedId, { forceRefresh: true })
        }
      } catch {

        toast.error(STRINGS.TOAST_REPLY_FAILED)
      }
    })()
  }, [setPostsByFeed, setFeeds, loadedFeedsRef, loadPostsForFeed])

  const handleCommentReaction = useCallback((
    feedId: string,
    postId: string,
    commentId: string,
    reaction: ReactionId | ''
  ) => {
    setPostsByFeed((current) => {
      const posts = current[feedId] ?? []
      const updated = posts.map((post) => {
        if (post.id !== postId) return post
        const comments = updateCommentTree(post.comments, commentId, (comment) => ({
          ...comment,
          ...applyReaction(comment.reactions, comment.userReaction, reaction),
        }))
        return { ...post, comments }
      })
      return { ...current, [feedId]: updated }
    })

    // Call API to set or remove reaction (empty string removes)
    void feedsApi.reactToComment(feedId, postId, commentId, reaction).catch(() => {

    })
  }, [setPostsByFeed])

  return {
    handleAddComment,
    handleReplyToComment,
    handleCommentReaction,
  }
}
