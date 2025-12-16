import DOMPurify from 'dompurify'
import { type FeedComment, type ReactionCounts, type ReactionId } from './types'

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Should be used before rendering any user-generated HTML content.
 */
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ADD_ATTR: ['target'], // Allow target="_blank" for links
  })
}

export const initials = (value: string) =>
  value
    .split(' ')
    .map((part) => part.slice(0, 1) || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const countReactions = (counts: ReactionCounts) =>
  Object.values(counts).reduce((acc, value) => acc + value, 0)

export const countComments = (comments: FeedComment[]): number => {
  return comments.reduce((total, comment) => {
    const replies = comment.replies ? countComments(comment.replies) : 0
    return total + 1 + replies
  }, 0)
}

export const sumCommentReactions = (comments: FeedComment[]): number => {
  return comments.reduce((total, comment) => {
    const replies = comment.replies ? sumCommentReactions(comment.replies) : 0
    return total + countReactions(comment.reactions) + replies
  }, 0)
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
  reaction: ReactionId
) => {
  const updated: ReactionCounts = { ...counts }
  let nextReaction = currentReaction ?? null

  if (currentReaction === reaction) {
    updated[reaction] = Math.max(0, (updated[reaction] ?? 0) - 1)
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
