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
  // Caption per attachment id; absent means uncaptioned.
  captions: Record<string, string>
}

export interface FeedPostEditDraft {
  body: string
  data?: PostData
  order: string[]
  newFiles: File[]
  // Keyed by order entry (attachment id or "new:N"). Existing ids always
  // appear, so clearing a caption reaches the server as an empty string.
  captions: Record<string, string>
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
  const existing = existingOrderIds(draft.order)
  if (!arraysEqual(existing, original.attachmentIds)) return false
  return existing.every(
    (id) => (draft.captions[id] ?? '') === (original.captions[id] ?? '')
  )
}

export function buildFeedPostEditDraft(editing: {
  body: string
  data: PostData
  items: Array<{ kind: 'existing'; attachment: { id: string } } | { kind: 'new'; file: File }>
  // Keyed by attachment id for existing items and by the caller's file key
  // for new ones; `fileKey` maps a new file to that key.
  captions: Record<string, string>
  fileKey: (file: File) => string
}): FeedPostEditDraft {
  const order: string[] = []
  const newFiles: File[] = []
  const captions: Record<string, string> = {}
  let newIndex = 0
  for (const item of editing.items) {
    if (item.kind === 'existing') {
      order.push(item.attachment.id)
      captions[item.attachment.id] = editing.captions[item.attachment.id] ?? ''
    } else {
      const placeholder = `new:${newIndex}`
      order.push(placeholder)
      const caption = editing.captions[editing.fileKey(item.file)]
      if (caption) captions[placeholder] = caption
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
    captions,
  }
}

export function feedPostEditOriginalFromPost(post: {
  body: string
  data?: PostData
  attachments?: Array<{ id: string; caption?: string }>
}): FeedPostEditOriginal {
  const captions: Record<string, string> = {}
  for (const att of post.attachments ?? []) {
    if (att.caption) captions[att.id] = att.caption
  }
  return {
    body: post.body,
    data: post.data,
    attachmentIds: (post.attachments ?? []).map((att) => att.id),
    captions,
  }
}
