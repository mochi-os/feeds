import type { FeedComment, ReactionCounts, ReactionId } from '@/types'
import DOMPurify from 'dompurify'

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Should be used before rendering any user-generated HTML content.
 */
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ADD_ATTR: ['target'], // Allow target="_blank" for links
  })
}

// Convert URLs in plain text to clickable <a> tags
const urlPattern = /https?:\/\/[^\s<>"')\]]+/g
export const linkifyText = (text: string): string => {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(urlPattern, (url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${url}</a>`
  )
}


export const randomId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`

export function updateCommentTree(
  comments: FeedComment[],
  targetId: string,
  updater: (comment: FeedComment) => FeedComment
): FeedComment[] {
  let changed = false

  const next = comments.map<FeedComment>((comment) => {
    if (comment.id === targetId) {
      changed = true
      return updater(comment)
    }
    if (comment.replies?.length) {
      const replies = updateCommentTree(comment.replies, targetId, updater)
      if (replies !== comment.replies) {
        changed = true
        return { ...comment, replies }
      }
    }
    return comment
  })

  return changed ? next : comments
}

export const applyReaction = (
  counts: ReactionCounts,
  currentReaction: ReactionId | null | undefined,
  reaction: ReactionId | ''
) => {
  const updated: ReactionCounts = { ...counts }
  let nextReaction: ReactionId | null = currentReaction ?? null

  // Empty string means remove reaction
  if (reaction === '' || currentReaction === reaction) {
    if (currentReaction) {
      updated[currentReaction] = Math.max(0, (updated[currentReaction] ?? 0) - 1)
    }
    nextReaction = null
  } else {
    if (currentReaction) {
      updated[currentReaction] = Math.max(0, (updated[currentReaction] ?? 0) - 1)
    }
    updated[reaction] = (updated[reaction] ?? 0) + 1
    nextReaction = reaction
  }

  return { reactions: updated, userReaction: nextReaction }
}
