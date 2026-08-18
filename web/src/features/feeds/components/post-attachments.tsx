// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import type { MutableRefObject, ReactNode } from 'react'
import { AttachmentGallery, authenticatedUrl, getAppPath, normalizeEntityUrl } from '@mochi/web'
import type { Attachment } from '@/types'

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
  const appPath = getAppPath()

  return (
    <AttachmentGallery
      attachments={attachments}
      getUrl={(att) =>
        authenticatedUrl(normalizeEntityUrl(att.url ?? `${appPath}/${feedId}/-/attachments/${att.id}`))
      }
      getThumbnailUrl={(att) =>
        authenticatedUrl(
          normalizeEntityUrl(att.thumbnail_url ?? `${appPath}/${feedId}/-/attachments/${att.id}/thumbnail`)
        )
      }
      getPreviewUrl={(att) =>
        authenticatedUrl(
          normalizeEntityUrl(att.preview_url ?? `${appPath}/${feedId}/-/attachments/${att.id}/preview`)
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
