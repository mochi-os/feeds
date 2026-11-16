// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { FeedComment, FeedPost, FeedSummary, ReactionId } from '@/types'
import { useLingui } from '@lingui/react/macro'
import { toast, useUploadProgress, type Upload } from '@mochi/web'
import { feedsApi } from '@/api/feeds'
import { startCommentReaction } from '@/features/feeds/comment-reaction'
import { createReactionCounts } from '@/features/feeds/constants'
import { randomId, removeCommentFromTree } from '@/features/feeds/utils'
import { patchCachedPost } from './posts-cache'

export type UseCommentActionsOptions = {
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  setPostsByFeed: React.Dispatch<
    React.SetStateAction<Record<string, FeedPost[]>>
  >
  currentUserId?: string
  currentUserName?: string
  commentDrafts: Record<string, string>
  setCommentDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>
  loadPostsForFeed?: (
    feedId: string,
    options?: boolean | { forceRefresh?: boolean }
  ) => Promise<void>
}

export type UseCommentActionsResult = {
  /** Add a top-level comment to a post. Rejects if the comment could not be
   * stored, after taking the optimistic comment back off the post. */
  handleAddComment: (
    feedId: string,
    postId: string,
    body?: string,
    files?: File[],
    attachment?: string
  ) => Promise<void>
  /** Reply to an existing comment */
  handleReplyToComment: (
    feedId: string,
    postId: string,
    parentCommentId: string,
    body: string,
    files?: File[]
  ) => Promise<void>
  /** React to a comment */
  handleCommentReaction: (
    feedId: string,
    postId: string,
    commentId: string,
    reaction: ReactionId | ''
  ) => void
  /** Byte progress of an in-flight comment or reply upload */
  commentProgress: Upload | null
}

export function useCommentActions({
  setFeeds,
  setPostsByFeed,
  currentUserId,
  currentUserName,
  commentDrafts,
  setCommentDrafts,
  loadPostsForFeed,
}: UseCommentActionsOptions): UseCommentActionsResult {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { progress: commentProgress, upload } = useUploadProgress()

  const rollbackComment = useCallback(
    (
      feedId: string,
      postId: string,
      commentId: string,
      draft: string,
      parentId?: string
    ) => {
      setPostsByFeed((current) => {
        const posts = current[feedId] ?? []
        const updated = posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: removeCommentFromTree(post.comments, commentId),
              }
            : post
        )
        return { ...current, [feedId]: updated }
      })
      patchCachedPost(queryClient, postId, (post) => ({
        ...post,
        comments: removeCommentFromTree(post.comments, commentId),
      }))
      // Replies carry their own draft inside the thread, so only a top-level
      // comment restores here — and only when the user has not already typed
      // something new in its place.
      if (!parentId) {
        setCommentDrafts((current) =>
          current[postId]?.trim() ? current : { ...current, [postId]: draft }
        )
      }
    },
    [queryClient, setPostsByFeed, setCommentDrafts]
  )

  const handleAddComment = useCallback(
    async (
      feedId: string,
      postId: string,
      body?: string,
      files?: File[],
      attachment?: string
    ) => {
      const draft = (body ?? commentDrafts[postId])?.trim()
      if (!draft) return

      const comment: FeedComment = {
        id: randomId('comment'),
        subscriberId: currentUserId ?? '',
        author: currentUserName || t`You`,
        created: Math.floor(Date.now() / 1000),
        body: draft,
        reactions: createReactionCounts(),
        userReaction: null,
        replies: [],
        attachment,
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

      // The pages show what the ['posts'] caches hold, so the comment goes
      // there too, or a refetch before the server has it takes it off screen.
      patchCachedPost(queryClient, postId, (post) =>
        post.comments.some((c) => c.id === comment.id)
          ? post
          : { ...post, comments: [comment, ...post.comments] }
      )

      setFeeds((current) =>
        current.map((feed) =>
          feed.id === feedId
            ? { ...feed, lastActive: Math.floor(Date.now() / 1000) }
            : feed
        )
      )

      setCommentDrafts((current) => ({ ...current, [postId]: '' }))

      try {
        // Unified endpoint handles both local and remote feeds
        const payload = {
          feed: feedId,
          post: postId,
          body: draft,
          id: comment.id,
          files,
          attachment,
        }
        if (files?.length) {
          await upload(
            (onProgress) => feedsApi.createComment(payload, onProgress),
            { sizes: files.map((file) => file.size) }
          )
        } else {
          await feedsApi.createComment(payload)
        }
        // Refetch to show server-saved attachments, and the resolved anchor
        // name for a comment written about an image.
        if ((files?.length || attachment) && loadPostsForFeed) {
          await loadPostsForFeed(feedId, { forceRefresh: true })
        }
      } catch (error) {
        rollbackComment(feedId, postId, comment.id, draft)
        toast.error(t`Failed to add comment. Please try again.`)
        // Rethrow so the composer keeps the attachments staged for a retry.
        throw error
      }
    },
    [
      commentDrafts,
      currentUserId,
      currentUserName,
      setPostsByFeed,
      setFeeds,
      setCommentDrafts,
      loadPostsForFeed,
      queryClient,
      rollbackComment,
      upload,
      t,
    ]
  )

  const handleReplyToComment = useCallback(
    async (
      feedId: string,
      postId: string,
      parentCommentId: string,
      body: string,
      files?: File[]
    ) => {
      const reply: FeedComment = {
        id: randomId('reply'),
        subscriberId: currentUserId ?? '',
        author: currentUserName || t`You`,
        created: Math.floor(Date.now() / 1000),
        body,
        reactions: createReactionCounts(),
        userReaction: null,
        replies: [],
      }

      // Helper to recursively add reply to the correct comment
      const addReplyToComment = (comments: FeedComment[]): FeedComment[] => {
        return comments.map((comment) => {
          if (comment.id === parentCommentId) {
            if ((comment.replies ?? []).some((r) => r.id === reply.id))
              return comment
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

      patchCachedPost(queryClient, postId, (post) => ({
        ...post,
        comments: addReplyToComment(post.comments),
      }))

      setFeeds((current) =>
        current.map((feed) =>
          feed.id === feedId
            ? { ...feed, lastActive: Math.floor(Date.now() / 1000) }
            : feed
        )
      )

      try {
        // Unified endpoint handles both local and remote feeds
        const payload = {
          feed: feedId,
          post: postId,
          body,
          parent: parentCommentId,
          id: reply.id,
          files,
        }
        if (files?.length) {
          await upload(
            (onProgress) => feedsApi.createComment(payload, onProgress),
            { sizes: files.map((file) => file.size) }
          )
        } else {
          await feedsApi.createComment(payload)
        }
        // Refetch to show server-saved attachments
        if (files?.length && loadPostsForFeed) {
          await loadPostsForFeed(feedId, { forceRefresh: true })
        }
      } catch (error) {
        rollbackComment(feedId, postId, reply.id, body, parentCommentId)
        toast.error(t`Failed to add reply. Please try again.`)
        throw error
      }
    },
    [
      currentUserId,
      currentUserName,
      setPostsByFeed,
      setFeeds,
      loadPostsForFeed,
      queryClient,
      rollbackComment,
      upload,
      t,
    ]
  )

  const handleCommentReaction = useCallback(
    (
      feedId: string,
      postId: string,
      commentId: string,
      reaction: ReactionId | ''
    ) => {
      // The list re-syncs its posts from the ['posts'] caches, so the
      // reaction goes there too, as post reactions do, or a later page fetch
      // would take it off the screen.
      const change = startCommentReaction(commentId, reaction)
      const onPost =
        (patch: <T extends Pick<FeedPost, 'comments'>>(post: T) => T) =>
        (post: FeedPost) => (post.id === postId ? patch(post) : post)
      const write = (
        patch: <T extends Pick<FeedPost, 'comments'>>(post: T) => T
      ) => {
        setPostsByFeed((current) => {
          const posts = current[feedId]
          if (!posts) return current
          return { ...current, [feedId]: posts.map(onPost(patch)) }
        })
        patchCachedPost(queryClient, postId, patch)
      }
      write(change.apply)

      // Call API to set or remove reaction (empty string removes)
      void feedsApi
        .reactToComment(feedId, postId, commentId, reaction)
        .then(change.accepted, () => {
          const undo = change.refused()
          if (undo) write(undo)
          toast.error(t`Failed to save reaction. Please try again.`)
        })
    },
    [queryClient, setPostsByFeed, t]
  )

  return {
    handleAddComment,
    handleReplyToComment,
    handleCommentReaction,
    commentProgress,
  }
}
