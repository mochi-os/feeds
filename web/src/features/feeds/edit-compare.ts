// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  arraysEqual,
  jsonValueUnchanged,
  textUnchanged,
  type PostData,
} from '@mochi/web'

export interface FeedPostEditOriginal {
  body: string
  data?: PostData
  attachmentIds: string[]
}

export interface FeedPostEditDraft {
  body: string
  data?: PostData
  order: string[]
  newFiles: File[]
}

function normalizePostData(data: PostData | undefined): PostData | undefined {
  if (!data || Object.keys(data).length === 0) return undefined
  return data
}

function existingOrderIds(order: string[]): string[] {
  return order.filter((item) => !item.startsWith('new:'))
}

export function isFeedPostEditUnchanged(
  original: FeedPostEditOriginal,
  draft: FeedPostEditDraft
): boolean {
  if (!textUnchanged(draft.body, original.body)) return false
  if (!jsonValueUnchanged(normalizePostData(draft.data), normalizePostData(original.data))) {
    return false
  }
  if (draft.newFiles.length > 0) return false
  return arraysEqual(existingOrderIds(draft.order), original.attachmentIds)
}

export function buildFeedPostEditDraft(editing: {
  body: string
  data: PostData
  items: Array<{ kind: 'existing'; attachment: { id: string } } | { kind: 'new'; file: File }>
}): FeedPostEditDraft {
  const order: string[] = []
  const newFiles: File[] = []
  let newIndex = 0
  for (const item of editing.items) {
    if (item.kind === 'existing') {
      order.push(item.attachment.id)
    } else {
      order.push(`new:${newIndex}`)
      newFiles.push(item.file)
      newIndex++
    }
  }
  const hasData = Object.keys(editing.data).length > 0
  return {
    body: editing.body.trim(),
    data: hasData ? editing.data : undefined,
    order,
    newFiles,
  }
}

export function feedPostEditOriginalFromPost(post: {
  body: string
  data?: PostData
  attachments?: Array<{ id: string }>
}): FeedPostEditOriginal {
  return {
    body: post.body,
    data: post.data,
    attachmentIds: (post.attachments ?? []).map((att) => att.id),
  }
}
