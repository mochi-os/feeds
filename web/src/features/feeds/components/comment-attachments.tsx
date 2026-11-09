// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { Attachment } from '@/types/posts'
import {
  AttachmentGallery,
  authenticatedUrl,
  getAppPath,
  normalizeEntityUrl,
} from '@mochi/web'

interface CommentAttachmentsProps {
  attachments?: Attachment[]
  feedId: string
}

export function CommentAttachments({
  attachments,
  feedId,
}: CommentAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null
  // A remote feed's answer carries no url: the owner's server built it for its
  // own routes. The address is then this app's own, from the id, as a post's.
  const address = (att: { id: string; url?: string }) =>
    att.url ?? `${getAppPath()}/${feedId}/-/attachments/${att.id}`

  return (
    <AttachmentGallery
      attachments={attachments}
      // authenticatedUrl, as the post gallery does: inside the sandboxed shell
      // iframe an <img> sends no cookies, so a private container's attachment
      // 401s and the thumbnail silently never appears. Only the post gallery
      // had this; comment attachments in a private feed/forum were invisible.
      getUrl={(att) => authenticatedUrl(normalizeEntityUrl(address(att)))}
      getThumbnailUrl={(att) =>
        authenticatedUrl(
          normalizeEntityUrl(
            att.thumbnail_url ?? `${address(att)}${att.url ? '' : '/thumbnail'}`
          )
        )
      }
      rowHeight={80}
    />
  )
}
