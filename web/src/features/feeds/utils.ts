// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import type { FeedComment, ReactionCounts, ReactionId } from '@/types'
import DOMPurify from 'dompurify'

/**
 * Return the URL only if it uses an http(s) scheme, else undefined. RSS <link>
 * values and remote post data are third-party; a javascript:/data: URL in an
 * <a href> executes on click (XSS). Use for any href built from post/source data.
 */
export const safeHref = (url: string | undefined | null): string | undefined => {
  if (!url) return undefined
  const scheme = url.trim().toLowerCase()
  return scheme.startsWith('http://') || scheme.startsWith('https://') ? url : undefined
}

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Should be used before rendering any user-generated HTML content.
 */
const ALLOWED_IFRAME_HOSTS = [
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
]

// Social share link patterns common in RSS feeds
const SHARE_LINK_RE = /twitter\.com\/(?:home\?status|intent\/tweet)|x\.com\/intent\/tweet|facebook\.com\/sharer|linkedin\.com\/shareArticle|reddit\.com\/submit/i

// Enforce the iframe host allowlist inside DOMPurify, where the parser has
// already normalized the markup. The previous pre-parse regex only matched
// iframes with a quoted src and a closing tag, so `<iframe src=//evil>` and
// unclosed variants slipped through and DOMPurify (which allows iframes) kept
// them. The hook re-checks every iframe's resolved host and drops any that is
// not allowlisted. Registered once at module load; DOMPurify hooks are global.
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName !== 'iframe') return
  const el = node as Element
  let host = ''
  try {
    // Sentinel base resolves protocol-relative/relative srcs deterministically;
    // a genuine allowlisted host in a `//host/...` src is unaffected.
    host = new URL(el.getAttribute('src') ?? '', 'https://invalid.invalid').hostname
  } catch {
    host = ''
  }
  if (!ALLOWED_IFRAME_HOSTS.includes(host)) {
    el.parentNode?.removeChild(el)
  }
})

export const sanitizeHtml = (html: string): string => {
  // Strip social share links (common RSS feed junk)
  const preStripped = html.replace(
    /<a\s[^>]*href=["'][^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
    (match) => SHARE_LINK_RE.test(match) ? '' : match
  )

  // iframe host filtering is enforced by the uponSanitizeElement hook above;
  // `style` is intentionally NOT allowed (inline styles enable clickjacking
  // overlays) — the image max-width below is re-applied after sanitizing.
  const clean = DOMPurify.sanitize(preStripped, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'img', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'iframe', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder'],
    ADD_ATTR: ['target'], // Allow target="_blank" for links
  })
  // Add referrerpolicy and max-width to images
  return clean.replace(/<img /g, '<img referrerpolicy="no-referrer" style="max-width:600px" ')
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


export function stripHtml(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  return doc.body.textContent || ''
}

export function stripImages(html: string): string {
  return html.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '').replace(/<img[^>]*\/?>/gi, '')
}

export function extractImgAttrs(html: string | undefined): { alt: string; title: string } {
  if (!html) return { alt: '', title: '' }
  const match = html.match(/<img[^>]*>/)
  if (!match) return { alt: '', title: '' }
  const altMatch = match[0].match(/alt="([^"]*)"/)
  const titleMatch = match[0].match(/title="([^"]*)"/)
  return {
    alt: altMatch?.[1] || '',
    title: titleMatch?.[1] || '',
  }
}

export function stripEllipsis(html: string): string {
  const textLength = html.replace(/<[^>]+>/g, '').length
  if (textLength > 400) {
    return html.replace(/…/g, '').replace(/\.{3,}/g, '')
  }
  return html
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

export function patchPostReaction<T extends {
  id: string
  reactions: ReactionCounts
  userReaction?: ReactionId | null
}>(
  post: T,
  reaction: ReactionId | ''
): T {
  return {
    ...post,
    ...applyReaction(post.reactions, post.userReaction, reaction),
  }
}
