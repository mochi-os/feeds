import { useCallback } from 'react'
import feedsApi from '@/api/feeds'
import { createReactionCounts, STRINGS } from '../constants'
import { applyReaction, randomId, updateCommentTree } from '../utils'
import type { FeedComment, FeedPost, FeedSummary, ReactionId } from '../types'

export type UseCommentActionsOptions = {
  selectedFeed: FeedSummary | null
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  setPostsByFeed: React.Dispatch<React.SetStateAction<Record<string, FeedPost[]>>>
  loadPostsForFeed: (feedId: string, forceRefresh?: boolean) => Promise<void>
  loadedFeedsRef: React.MutableRefObject<Set<string>>
  commentDrafts: Record<string, string>
  setCommentDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

export type UseCommentActionsResult = {
  /** Add a top-level comment to a post */
  handleAddComment: (postId: string) => void
  /** Reply to an existing comment */
  handleReplyToComment: (postId: string, parentCommentId: string, body: string) => void
  /** React to a comment */
  handleCommentReaction: (postId: string, commentId: string, reaction: ReactionId) => void
}

export function useCommentActions({
  selectedFeed,
  setFeeds,
  setPostsByFeed,
  loadPostsForFeed,
  loadedFeedsRef,
  commentDrafts,
  setCommentDrafts,
}: UseCommentActionsOptions): UseCommentActionsResult {

  const handleAddComment = useCallback((postId: string) => {
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
  }, [selectedFeed, commentDrafts, setPostsByFeed, setFeeds, setCommentDrafts, loadedFeedsRef, loadPostsForFeed])

  const handleReplyToComment = useCallback((postId: string, parentCommentId: string, body: string) => {
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
  }, [selectedFeed, setPostsByFeed, setFeeds, loadedFeedsRef, loadPostsForFeed])

  const handleCommentReaction = useCallback((
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

    // Only call API when setting an actual reaction, not when removing (empty string fails on backend)
    if (nextReaction) {
      void feedsApi
        .reactToComment({
          comment: commentId,
          reaction: nextReaction,
        })
        .catch((error) => {
          console.error('[Feeds] Failed to react to comment', error)
        })
    }
  }, [selectedFeed, setPostsByFeed])

  return {
    handleAddComment,
    handleReplyToComment,
    handleCommentReaction,
  }
}
