// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import endpoints from './endpoints'

type Build = (...ids: string[]) => string

// One builder of each shape the table has: a feed, a feed and a post, a feed,
// a post and a comment, and a member's asset. Each with the path a normal id
// gave before the ids went through path.
const shapes: Array<[string, Build, number, string]> = [
  ['feeds.posts', (feed) => endpoints.feeds.posts(feed), 1, 'f1/-/posts'],
  [
    'notifications.feedSet',
    (feed) => endpoints.notifications.feedSet(feed),
    1,
    'f1/-/notifications/set',
  ],
  [
    'feeds.post.edit',
    (feed, post) => endpoints.feeds.post.edit(feed, post),
    2,
    'f1/-/p1/edit',
  ],
  [
    'feeds.comment.delete',
    (feed, post, comment) =>
      endpoints.feeds.comment.delete(feed, post, comment),
    3,
    'f1/-/p1/c1/delete',
  ],
  [
    'feeds.memberAsset',
    (feed, member) => endpoints.feeds.memberAsset(feed, member, 'avatar'),
    2,
    'f1/-/members/p1/asset/avatar',
  ],
]

const normal = ['f1', 'p1', 'c1']
const refused = ['../delete', 'a/b', '.', '..', '']

function replaced(position: number, value: string): string[] {
  return normal.map((id, i) => (i === position ? value : id))
}

describe.each(shapes)('%s', (_, build, ids, before) => {
  it('builds the same path for normal ids', () => {
    expect(build(...normal)).toBe(before)
  })

  for (let position = 0; position < ids; position++) {
    it.each(refused)(`refuses %j in id ${position + 1}`, (value) => {
      expect(() => build(...replaced(position, value))).toThrow(/path: refused/)
    })

    it(`keeps a query in id ${position + 1} inside its segment`, () => {
      const built = build(...replaced(position, 'x?y=1'))
      expect(built).toContain('x%3Fy%3D1')
      expect(built).not.toContain('?')
    })
  }
})

describe('feeds.memberAsset', () => {
  it('refuses a member named by a URL, whose slashes cannot be one segment', () => {
    expect(() =>
      endpoints.feeds.memberAsset(
        'f1',
        'https://mastodon.example/users/ann',
        'style'
      )
    ).toThrow(/path: refused/)
  })
})
