// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { FeedComment } from '@/types'
import { describe, expect, it } from 'vitest'
import { authorAssets, commentAssets } from './author-assets'
import { createReactionCounts } from './constants'

function by(
  id: string,
  subscriberId: string,
  replies: FeedComment[] = []
): FeedComment {
  return {
    id,
    subscriberId,
    author: subscriberId,
    created: 1,
    body: '',
    reactions: createReactionCounts(),
    userReaction: null,
    replies,
  }
}

describe('authorAssets', () => {
  it("names each commenter's first comment under its own feed and post", () => {
    const found = authorAssets([
      {
        id: 'p1',
        feedId: 'f1',
        comments: [by('c1', 'ann', [by('c2', 'bob')])],
      },
      { id: 'p2', feedId: 'f2', comments: [by('c3', 'bob'), by('c4', 'cat')] },
    ])
    expect(Object.fromEntries(found)).toEqual({
      ann: '/f1/-/p1/c1/asset',
      bob: '/f1/-/p1/c2/asset',
      cat: '/f2/-/p2/c4/asset',
    })
  })

  it('takes a post without comments in its stride', () => {
    expect(authorAssets([{ id: 'p1', feedId: 'f1' }]).size).toBe(0)
  })

  // A comment's id is whatever its author sent, and the style is fetched with
  // the reader's token: `../delete?x=` made every reader's page GET the feed's
  // delete action.
  it('passes over a comment whose id cannot be one path segment', () => {
    const found = authorAssets([
      {
        id: 'p1',
        feedId: 'f1',
        comments: [by('../delete?x=', 'eve'), by('c2', 'eve')],
      },
    ])
    expect(Object.fromEntries(found)).toEqual({ eve: '/f1/-/p1/c2/asset' })
  })
})

describe('commentAssets', () => {
  it('encodes each id as one segment', () => {
    expect(commentAssets('f1', 'p1', 'delete?x=')).toBe(
      '/f1/-/p1/delete%3Fx%3D/asset'
    )
    expect(commentAssets('f1', 'p1', 'a#b\\c')).toBe('/f1/-/p1/a%23b%5Cc/asset')
  })

  it.each([
    ['a comment that climbs', ['f1', 'p1', '../delete?x=']],
    ['a comment that adds a segment', ['f1', 'p1', 'x/delete']],
    ['a post of two dots', ['f1', '..', 'c1']],
    ['an empty feed', ['', 'p1', 'c1']],
  ])('gives no address for %s', (_name, [feedId, postId, commentId]) => {
    expect(commentAssets(feedId, postId, commentId)).toBeUndefined()
  })
})
