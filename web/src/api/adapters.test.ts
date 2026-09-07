// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* eslint-disable lingui/no-unlocalized-strings -- test assertions and fixtures, not user-facing */
import { describe, expect, it } from 'vitest'
import { mapPosts } from './adapters'
import type { Post, Reaction } from '@/types'

function reaction(subscriber: string, r: Reaction['reaction']): Reaction {
  return { feed: 'f1', post: 'p1', subscriber, name: subscriber, reaction: r }
}

function post(overrides: Partial<Post>): Post {
  return {
    id: 'p1',
    feed: 'feeds/f1',
    feed_fingerprint: 'fp',
    feed_name: 'Feed',
    body: '',
    body_markdown: '',
    data: {},
    created: 0,
    created_string: '',
    updated: 0,
    attachments: [],
    my_reaction: '',
    reactions: [],
    comments: [],
    up: 0,
    down: 0,
    read: 0,
    ...overrides,
  } as Post
}

describe('mapPosts own-reaction counting', () => {
  it("counts the caller's own reaction when another subscriber shares it and the caller's row is absent", () => {
    // The server omitted the caller's own row but a different subscriber holds
    // the same reaction. The caller's reaction must still be counted.
    const p = post({
      my_reaction: 'like',
      reactions: [reaction('other-user', 'like')],
    })

    const [mapped] = mapPosts([p], 'me')

    // other-user's like + the caller's own like. The pre-fix predicate matched
    // ANY subscriber with the reaction, so it dropped the caller's own and
    // returned 1.
    expect(mapped.reactions.like).toBe(2)
    expect(mapped.userReaction).toBe('like')
  })

  it("does not double-count when the server already includes the caller's own row", () => {
    const p = post({
      my_reaction: 'like',
      reactions: [reaction('me', 'like')],
    })

    const [mapped] = mapPosts([p], 'me')

    expect(mapped.reactions.like).toBe(1)
  })

  it('applies the same rule to comment reactions', () => {
    const p = post({
      comments: [
        {
          id: 'c1',
          feed: 'f1',
          feed_fingerprint: 'fp',
          post: 'p1',
          parent: '',
          subscriber: 'author',
          name: 'Author',
          body: 'hi',
          body_markdown: 'hi',
          created: 0,
          created_string: '',
          user: 'author',
          my_reaction: 'love',
          reactions: [{ feed: 'f1', post: 'p1', comment: 'c1', subscriber: 'other-user', name: 'Other', reaction: 'love' }],
          children: [],
        },
      ] as Post['comments'],
    })

    const [mapped] = mapPosts([p], 'me')

    expect(mapped.comments[0].reactions.love).toBe(2)
  })
})

describe('mapPosts per-post permissions (aggregate)', () => {
  it('carries the server-stamped per-feed permissions through to the mapped post', () => {
    // The aggregate ("All feeds") endpoint stamps each post with its own feed's
    // access (#152). mapPosts must pass it through so feed-posts.tsx can gate
    // react/comment/manage per feed instead of granting by fallback.
    const p = post({
      permissions: { view: true, react: true, comment: true, manage: false },
    })

    const [mapped] = mapPosts([p], 'me')

    expect(mapped.permissions).toEqual({ view: true, react: true, comment: true, manage: false })
  })

  it('leaves permissions undefined when the server did not stamp one', () => {
    const [mapped] = mapPosts([post({})], 'me')

    expect(mapped.permissions).toBeUndefined()
  })
})
