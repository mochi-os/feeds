// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { AttachmentGallery, authenticatedUrl, normalizeEntityUrl } from '@mochi/web'
import type { Attachment } from '@/types/posts'

interface CommentAttachmentsProps {
  attachments?: Attachment[]
}

export function CommentAttachments({ attachments }: CommentAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null

  return (
    <AttachmentGallery
      attachments={attachments}
      // authenticatedUrl, as the post gallery does: inside the sandboxed shell
      // iframe an <img> sends no cookies, so a private container's attachment
      // 401s and the thumbnail silently never appears. Only the post gallery
      // had this; comment attachments in a private feed/forum were invisible.
      getUrl={(att) => authenticatedUrl(normalizeEntityUrl(att.url ?? ''))}
      getThumbnailUrl={(att) => authenticatedUrl(normalizeEntityUrl(att.thumbnail_url ?? att.url ?? ''))}
      rowHeight={80}
    />
  )
}
