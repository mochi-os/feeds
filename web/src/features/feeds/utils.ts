import type { FeedComment, ReactionCounts, ReactionId } from '@/types'
import DOMPurify from 'dompurify'

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Should be used before rendering any user-generated HTML content.
 */
export const sanitizeHtml = (html: string): string => {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'img', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'iframe', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'style'],
    ADD_ATTR: ['target'], // Allow target="_blank" for links
  })
  // Add referrerpolicy and max-width to images
  return clean.replace(/<img /g, '<img referrerpolicy="no-referrer" style="max-width:672px" ')
}

/**
 * Convert standalone YouTube/Vimeo links in HTML to responsive iframe embeds.
 * Only replaces <a> tags that are the sole content of their <p> tag.
 */
export const embedVideos = (html: string): string => {
  // Match <p> tags containing only a single <a> tag pointing to a video URL
  return html.replace(
    /<p>\s*<a[^>]+href="(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)([^"&\s]+)[^"]*)"[^>]*>[^<]*<\/a>\s*<\/p>/gi,
    (_match, url: string, id: string) => {
      let embedUrl: string | null = null

      if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        // Extract video ID - for youtube.com/watch?v=ID, id captures from v= onward
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
        if (ytMatch) {
          embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`
        }
      } else if (url.includes('vimeo.com/')) {
        embedUrl = `https://player.vimeo.com/video/${id}`
      }

      if (!embedUrl) return _match

      return `<div style="width:267px;height:150px;overflow:hidden;border-radius:8px"><iframe src="${embedUrl}" style="width:100%;height:100%" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
    }
  )
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
