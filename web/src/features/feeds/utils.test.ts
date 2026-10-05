// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import {
  inListedOrder,
  linkifyText,
  sanitizeHtml,
  sectionErrorFrom,
} from './utils'

describe('sectionErrorFrom', () => {
  it('surfaces the real error message rather than a hardcoded string', () => {
    const error = sectionErrorFrom(
      new Error('Feed service unavailable'),
      'fallback'
    )
    // Pre-fix this returned new Error('Unable to load posts right now.'),
    // discarding the server's (already-translated) message.
    expect(error?.message).toBe('Feed service unavailable')
  })

  it('uses the given fallback when the error carries no message', () => {
    expect(sectionErrorFrom({ status: 500 }, 'Fallback message')?.message).toBe(
      'Fallback message'
    )
  })

  it('returns null when there is no error', () => {
    expect(sectionErrorFrom(null, 'fallback')).toBeNull()
    expect(sectionErrorFrom(undefined, 'fallback')).toBeNull()
  })
})

describe('sanitizeHtml', () => {
  it("drops class, so remote HTML cannot reach the app's own overlay utilities", () => {
    const html = sanitizeHtml(
      '<a href="https://evil.example" class="fixed inset-0 z-50 opacity-0">x</a>'
    )
    expect(html).toContain('href="https://evil.example"')
    expect(html).not.toContain('class=')
  })

  it('keeps the attributes a link needs', () => {
    const html = sanitizeHtml(
      '<a href="https://example.com" target="_blank" rel="noopener">x</a>'
    )
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
  })
})

describe('linkifyText', () => {
  it('emits anchors the wrapper styles, with no class of their own', () => {
    const html = linkifyText('see https://example.com/page now')
    expect(html).toContain('<a href="https://example.com/page"')
    expect(html).not.toContain('class=')
  })
})

describe('inListedOrder', () => {
  const post = (id: string, created: number) => ({ id, created })
  const ids = (posts: { id: string }[]) => posts.map((item) => item.id)

  it('puts posts in the order the server listed them, whatever their dates', () => {
    // Top: the server ranks the two liked posts first, though both are older.
    const listed = [post('p2', 2), post('p5', 5), post('p8', 8), post('p7', 7)]
    // The page holds them in buckets by feed.
    const bucketed = [
      post('p8', 8),
      post('p5', 5),
      post('p7', 7),
      post('p2', 2),
    ]

    expect(ids(inListedOrder(bucketed, listed))).toEqual([
      'p2',
      'p5',
      'p8',
      'p7',
    ])
  })

  it('puts a post the server has not listed after those it has, newest first', () => {
    const listed = [post('p2', 2), post('p8', 8)]
    const held = [post('old', 1), post('p8', 8), post('new', 9), post('p2', 2)]

    expect(ids(inListedOrder(held, listed))).toEqual(['p2', 'p8', 'new', 'old'])
  })

  it('leaves the list it was given as it was', () => {
    const held = [post('b', 1), post('a', 2)]

    inListedOrder(held, [post('a', 2), post('b', 1)])

    expect(ids(held)).toEqual(['b', 'a'])
  })
})
