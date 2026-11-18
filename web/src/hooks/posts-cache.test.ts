// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { describe, expect, it } from 'vitest'
import { patchCachedPost } from './posts-cache'

type Pages = InfiniteData<{ posts: FeedPost[] }>

const post = (id: string) => ({ id, body: id }) as unknown as FeedPost

describe('patchCachedPost', () => {
  it('changes the post in every list holding it, and nothing else', () => {
    const client = new QueryClient()
    const lists = [
      ['posts', '__all__', { aggregate: true }],
      ['posts', 'feed-1', { aggregate: false }],
    ]
    for (const key of lists) {
      client.setQueryData<Pages>(key, {
        pages: [{ posts: [post('a')] }, { posts: [post('b')] }],
        pageParams: [undefined, 1],
      })
    }
    client.setQueryData(['feeds', 'single-post', 'feed-1'], post('b'))

    patchCachedPost(client, 'b', (p) => ({ ...p, body: 'changed' }))

    for (const key of lists) {
      const pages = client.getQueryData<Pages>(key)?.pages
      expect(pages?.[0].posts[0].body).toBe('a')
      expect(pages?.[1].posts[0].body).toBe('changed')
    }
    expect(
      client.getQueryData<FeedPost>(['feeds', 'single-post', 'feed-1'])?.body
    ).toBe('b')
  })
})
