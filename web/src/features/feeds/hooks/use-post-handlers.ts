// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback } from 'react'
import { useLingui } from '@lingui/react/macro'
import { toast, getErrorMessage, type PostData } from '@mochi/web'
import { feedsApi } from '@/api/feeds'

interface UsePostHandlersProps {
  onRefresh: (feedId: string) => Promise<void>
}

export function usePostHandlers({ onRefresh }: UsePostHandlersProps) {
  const { t } = useLingui()
  const handleEditPost = useCallback(
    async (
      feedId: string,
      postId: string,
      body: string,
      data?: PostData,
      order?: string[],
      files?: File[]
    ) => {
      try {
        await feedsApi.editPost({
          feed: feedId,
          post: postId,
          body,
          data,
          order,
          files,
        })
        await onRefresh(feedId)
        toast.success(t`Post updated`)
      } catch (error) {
        toast.error(getErrorMessage(error, t`Failed to edit post`))
      }
    },
    [onRefresh, t]
  )

  const handleDeletePost = useCallback(
    async (feedId: string, postId: string) => {
      try {
        await feedsApi.deletePost(feedId, postId)
        await onRefresh(feedId)
        toast.success(t`Post deleted`)
      } catch (error) {
        toast.error(getErrorMessage(error, t`Failed to delete post`))
      }
    },
    [onRefresh, t]
  )

  const handleEditComment = useCallback(
    async (feedId: string, postId: string, commentId: string, body: string) => {
      try {
        await feedsApi.editComment(feedId, postId, commentId, body)
        await onRefresh(feedId)
        toast.success(t`Comment updated`)
      } catch (error) {
        toast.error(getErrorMessage(error, t`Failed to edit comment`))
      }
    },
    [onRefresh, t]
  )

  const handleDeleteComment = useCallback(
    async (feedId: string, postId: string, commentId: string) => {
      try {
        await feedsApi.deleteComment(feedId, postId, commentId)
        await onRefresh(feedId)
        toast.success(t`Comment deleted`)
      } catch (error) {
        toast.error(getErrorMessage(error, t`Failed to delete comment`))
      }
    },
    [onRefresh, t]
  )

  return {
    handleEditPost,
    handleDeletePost,
    handleEditComment,
    handleDeleteComment,
  }
}
