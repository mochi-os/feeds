// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { getAppPath, path, tryPath } from '@mochi/web'

export type AttachmentVariant = 'thumbnail' | 'preview' | 'medium'

// The address of an attachment's bytes on this app's own route, from the feed
// and the attachment's id. The id can come from another server, so it goes in
// as one encoded segment; one that cannot be a segment gives no address, and
// the attachment is left out rather than fetched from another path.
export function attachmentAddress(
  feedId: string,
  attachmentId: string,
  variant?: AttachmentVariant
): string | undefined {
  return tryPath(() => {
    const address = path`${feedId}/-/attachments/${attachmentId}`
    return `${getAppPath()}/${address}${variant ? `/${variant}` : ''}`
  })
}
