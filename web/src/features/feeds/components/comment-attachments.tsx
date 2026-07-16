// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { AttachmentGallery, normalizeEntityUrl } from '@mochi/web'
import type { Attachment } from '@/types/posts'

interface CommentAttachmentsProps {
  attachments?: Attachment[]
}

export function CommentAttachments({ attachments }: CommentAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null

  return (
    <AttachmentGallery
      attachments={attachments}
      getUrl={(att) => normalizeEntityUrl(att.url ?? '')}
      getThumbnailUrl={(att) => normalizeEntityUrl(att.thumbnail_url ?? att.url ?? '')}
      rowHeight={80}
    />
  )
}
