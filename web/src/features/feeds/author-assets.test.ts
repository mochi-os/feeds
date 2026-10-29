// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { FeedComment } from '@/types'
import { describe, expect, it } from 'vitest'
import { authorAssets } from './author-assets'
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
})
