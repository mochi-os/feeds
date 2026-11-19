// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useMemo, type MutableRefObject, type ReactNode } from 'react'
import type { Attachment } from '@/types'
import {
  AttachmentGallery,
  authenticatedUrl,
  normalizeEntityUrl,
} from '@mochi/web'
import { attachmentAddress, type AttachmentVariant } from '../attachment-url'

type PostAttachmentsProps = {
  attachments: Attachment[]
  feedId: string
  inline?: boolean
  mediaCap?: number
  /** The lightbox comments slot: the count and the thread panel per attachment id. */
  commentCount?: (attachmentId: string) => number
  renderComments?: (attachmentId: string) => ReactNode
  /** Filled with a function that opens the lightbox on an attachment, comments showing. */
  openerRef?: MutableRefObject<((attachmentId: string) => void) | null>
}

export function PostAttachments({
  attachments,
  feedId,
  inline = false,
  mediaCap = 8,
  commentCount,
  renderComments,
  openerRef,
}: PostAttachmentsProps) {
  // An attachment whose id cannot be one path segment is left out: its
  // addresses would reach another of the app's actions.
  const shown = useMemo(
    () =>
      attachments.filter(
        (att) => attachmentAddress(feedId, att.id) !== undefined
      ),
    [attachments, feedId]
  )
  const address = (
    given: string | undefined,
    att: { id: string },
    variant?: AttachmentVariant
  ) =>
    authenticatedUrl(
      normalizeEntityUrl(
        given ?? attachmentAddress(feedId, att.id, variant) ?? ''
      )
    )

  return (
    <AttachmentGallery
      attachments={shown}
      getUrl={(att) => address(att.url, att)}
      getThumbnailUrl={(att) => address(att.thumbnail_url, att, 'thumbnail')}
      getPreviewUrl={(att) => address(att.preview_url, att, 'preview')}
      getMediumUrl={(att) =>
        address(
          att.preview_url?.replace(/\/preview$/, '/medium'),
          att,
          'medium'
        )
      }
      inline={inline}
      mediaCap={mediaCap}
      showCaptions
      commentCount={commentCount}
      renderComments={renderComments}
      openerRef={openerRef}
    />
  )
}
