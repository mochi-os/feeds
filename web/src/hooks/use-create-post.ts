// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { toast, useAttachmentError, useUploadProgress } from '@mochi/web'
import { feedsApi } from '@/api/feeds'
import { useSidebarContext } from '@/context/sidebar-context'
import type { NewPostInput } from '@/features/feeds/components/new-post-dialog'

/**
 * Posts what the new post dialog holds, with its upload's progress, and
 * refreshes what shows the feed's posts. A refusal is reported and thrown,
 * so the dialog keeps the draft.
 */
export function useCreatePost() {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { postRefreshHandler } = useSidebarContext()
  const { progress, upload } = useUploadProgress()
  const attachmentError = useAttachmentError()

  const submit = useCallback(
    async (input: NewPostInput) => {
      try {
        const payload = {
          feed: input.feedId,
          body: input.body,
          data: input.data,
          files: input.files,
          captions: input.captions,
          accounts: input.accounts,
          features: input.features,
          poll: input.poll,
        }
        if (input.files.length) {
          await upload(
            (onProgress) => feedsApi.createPost(payload, onProgress),
            {
              sizes: input.files.map((file) => file.size),
            }
          )
        } else {
          await feedsApi.createPost(payload)
        }
        // Invalidate TanStack Query cache (for individual feed pages)
        await queryClient.invalidateQueries({
          queryKey: ['posts', input.feedId],
        })
        // Call the home page refresh handler if registered
        postRefreshHandler.current?.(input.feedId)
        toast.success(t`Post created`)
      } catch (error) {
        toast.error(attachmentError(error, t`Failed to create post`))
        throw error
      }
    },
    [queryClient, postRefreshHandler, upload, t, attachmentError]
  )

  return { submit, progress }
}
