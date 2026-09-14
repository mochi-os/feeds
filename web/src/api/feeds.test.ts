// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  createAppClient: () => ({ get: vi.fn(), post, delete: vi.fn() }),
}))

import { feedsApi } from './feeds'

// The order fields of the one post edit sent, as the server reads them.
function sent(): string[] {
  expect(post).toHaveBeenCalledTimes(1)
  const form = post.mock.calls[0][1] as FormData
  return form.getAll('order') as string[]
}

describe('feedsApi.editPost', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { success: true } })
  })

  it('sends the attachment order as one JSON array', async () => {
    await feedsApi.editPost({ feed: 'f', post: 'p', body: 'b', order: ['a1', 'new:0'] })
    expect(sent()).toEqual(['["a1","new:0"]'])
  })

  it('sends an empty order, so removing every attachment reaches the server', async () => {
    await feedsApi.editPost({ feed: 'f', post: 'p', body: 'b', order: [] })
    expect(sent()).toEqual(['[]'])
  })

  it('sends no order when the attachments were not touched', async () => {
    await feedsApi.editPost({ feed: 'f', post: 'p', body: 'b' })
    expect(sent()).toEqual([])
  })
})
