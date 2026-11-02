// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { post, get, save } = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  createAppClient: () => ({ get, post, delete: vi.fn() }),
  shellSaveBlob: save,
}))

import { feedsApi } from './feeds'

// The order fields of the one post edit sent, as the server reads them.
function sent(): string[] {
  expect(post).toHaveBeenCalledTimes(1)
  const form = post.mock.calls[0][1] as FormData
  return form.getAll('order') as string[]
}

describe('feedsApi.get', () => {
  it('asks for a feed held here only when told to', async () => {
    get.mockResolvedValue({ data: { posts: [] } })
    await feedsApi.get('fp', { limit: 20, local: '1' })
    expect(get.mock.calls[0][1].params).toEqual(
      expect.objectContaining({ limit: '20', local: '1' })
    )
  })
})

// A backup is fetched through the app's own client, which carries its token
// to the action's address, and saved by the shell: a plain link carried no
// token, resolved against the page and was ignored in the sandbox.
describe('feedsApi.downloadBackup', () => {
  it('fetches the file as a blob from the feed\'s action and has the shell save it', async () => {
    const blob = new Blob(['{}'])
    get.mockReset().mockResolvedValue(blob)
    save.mockReset().mockResolvedValue(true)
    expect(await feedsApi.downloadBackup('f1', 'a1', 'posts-2026-11.jsonl')).toBe(true)
    expect(get).toHaveBeenCalledWith('f1/-/backups/file', {
      params: { account: 'a1', name: 'posts-2026-11.jsonl' },
      responseType: 'blob',
    })
    expect(save).toHaveBeenCalledWith(blob, 'posts-2026-11.jsonl')
  })
})

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

describe('feedsApi.addSource', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { source: { id: 's1' }, ingested: 20 } })
  })

  // The server bounds the add, which fetches the source, and always answers.
  it("waits for the server's answer rather than giving up on its own", async () => {
    await feedsApi.addSource('f', 'tag', '#fediverse@mastodon.social')
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][2]).toEqual({ timeout: 0 })
  })
})

describe('feedsApi.importFollows', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { imported: 2, more: false, total: 3 } })
  })

  // The action answers inside a data envelope, as feeds' actions do.
  it('answers the counts from inside the envelope', async () => {
    const answer = await feedsApi.importFollows('f', 'Account address\nbob@there.example\n')
    expect(answer).toEqual({ imported: 2, more: false, total: 3 })
  })
})
