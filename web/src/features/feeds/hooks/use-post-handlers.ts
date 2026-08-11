// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  toast,
  getErrorMessage,
  textUnchanged,
  useUploadProgress,
  useAttachmentError,
  type PostData,
} from '@mochi/web'
import { feedsApi } from '@/api/feeds'
import {
  isFeedPostEditUnchanged,
  type FeedPostEditOriginal,
} from '@/features/feeds/edit-compare'

interface UsePostHandlersProps {
  onRefresh: (feedId: string) => Promise<void>
}

export function usePostHandlers({ onRefresh }: UsePostHandlersProps) {
  const { t } = useLingui()
  const { progress: editProgress, upload } = useUploadProgress()
  const attachmentError = useAttachmentError()
  const handleEditPost = useCallback(
    async (
      feedId: string,
      postId: string,
      body: string,
      original: FeedPostEditOriginal,
      data?: PostData,
      order?: string[],
      files?: File[]
    ): Promise<boolean> => {
      if (
        isFeedPostEditUnchanged(original, {
          body,
          data,
          order: order ?? [],
          newFiles: files ?? [],
        })
      ) {
        return true
      }
      const payload = {
        feed: feedId,
        post: postId,
        body,
        data,
        order,
        files,
      }
      try {
        if (files?.length) {
          await upload((onProgress) => feedsApi.editPost(payload, onProgress), {
            // Only the new files are in the body; the saved attachments are
            // referenced by `order`.
            sizes: files.map((file) => file.size),
          })
        } else {
          await feedsApi.editPost(payload)
        }
        await onRefresh(feedId)
        toast.success(t`Post updated`)
        return true
      } catch (error) {
        toast.error(attachmentError(error, t`Failed to edit post`))
        return false
      }
    },
    [onRefresh, t, upload]
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
    async (
      feedId: string,
      postId: string,
      commentId: string,
      body: string,
      originalBody: string
    ) => {
      if (textUnchanged(body, originalBody)) {
        return
      }
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
    editProgress,
    handleDeletePost,
    handleEditComment,
    handleDeleteComment,
  }
}
