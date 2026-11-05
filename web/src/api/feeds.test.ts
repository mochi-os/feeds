// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { post, get, save, warning } = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  createAppClient: () => ({ get, post, delete: vi.fn() }),
  shellSaveBlob: save,
  toast: { warning },
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

// Imports work within the server's budget and book the rest, so the client
// sets no limit of its own: a limit shorter than the budget reported a failure
// for an import that went on to finish.
describe('imports wait for the server', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { imported: 1, more: false } })
  })

  it('importFollows', async () => {
    await feedsApi.importFollows('f', 'Account address\nbob@there.example\n')
    expect(post.mock.calls[0][2]).toEqual({ timeout: 0 })
  })

  it('importAccount', async () => {
    await feedsApi.importAccount('f', 'a1', 'follows')
    expect(post.mock.calls[0][2]).toEqual({ timeout: 0 })
  })

  it('allowWaiting', async () => {
    await feedsApi.allowWaiting('f', 'there.example')
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

// These actions answer inside a data envelope, which the client hands back as
// it came; each call reads the answer from inside it.
describe('answers from inside the envelope', () => {
  beforeEach(() => {
    post.mockReset()
    get.mockReset()
  })

  it('pinPost answers the pin', async () => {
    post.mockResolvedValue({ data: { post: 'p1', pinned: 1700000000 } })
    expect(await feedsApi.pinPost('f1', 'p1', true)).toEqual({ post: 'p1', pinned: 1700000000 })
  })

  it('boostPost answers the copies', async () => {
    const copies = [{ address: 'me.example', network: 'bluesky', remote: 'at://x', url: '' }]
    post.mockResolvedValue({ data: { copies } })
    expect(await feedsApi.boostPost('f1', 'p1', 'a1', true)).toEqual({ copies })
  })

  it('votePoll answers the poll as it now stands and the options voted for', async () => {
    const poll = { options: [{ name: 'Tea', votes: 1 }], multiple: false, expires: 0, voters: 1 }
    post.mockResolvedValue({ data: { post: 'p1', poll, voted: [0] } })
    expect(await feedsApi.votePoll('f1', 'p1', [0])).toEqual({ post: 'p1', poll, voted: [0] })
  })

  it('setPrivacy sends the privacy to the feed and answers it', async () => {
    post.mockResolvedValue({ data: { privacy: 'public' } })
    expect(await feedsApi.setPrivacy('f1', 'public')).toEqual({
      privacy: 'public',
    })
    expect(post).toHaveBeenCalledWith('f1/-/privacy', {
      feed: 'f1',
      privacy: 'public',
    })
  })

  it('getFilters answers the filters', async () => {
    const filters = [{ id: 'x', phrase: 'zebra' }]
    get.mockResolvedValue({ data: { filters } })
    expect(await feedsApi.getFilters('f1')).toEqual({ filters })
  })

  it('addFilter answers the filters', async () => {
    const filters = [{ id: 'x', phrase: 'zebra' }]
    post.mockResolvedValue({ data: { filters } })
    expect(await feedsApi.addFilter('f1', 'zebra')).toEqual({ filters })
  })

  it('removeFilter answers the filters left', async () => {
    post.mockResolvedValue({ data: { filters: [] } })
    expect(await feedsApi.removeFilter('f1', 'x')).toEqual({ filters: [] })
  })

  it('people answers the people', async () => {
    const people = [{ contact: 'c', name: 'Zoe', handle: '@zoe@there.example', network: 'fediverse' }]
    get.mockResolvedValue({ data: { people } })
    expect(await feedsApi.people()).toEqual({ people })
  })
})

// A copy on another network that went without a file says so once the post
// is made or edited, a line each as the server words it.
describe('feedsApi unsent', () => {
  beforeEach(() => {
    post.mockReset()
    warning.mockReset()
  })

  it('warns of each file a new post went without', async () => {
    post.mockResolvedValue({ data: { id: 'p', unsent: ['First', 'Second'] } })
    await feedsApi.createPost({ feed: 'f', body: 'b' })
    expect(warning.mock.calls).toEqual([['First'], ['Second']])
  })

  it('warns of each file an edit went without', async () => {
    post.mockResolvedValue({ data: { success: true, unsent: ['Third'] } })
    await feedsApi.editPost({ feed: 'f', post: 'p', body: 'b' })
    expect(warning.mock.calls).toEqual([['Third']])
  })

  it('says nothing where every copy went whole', async () => {
    post.mockResolvedValue({ data: { id: 'p', unsent: [] } })
    await feedsApi.createPost({ feed: 'f', body: 'b' })
    post.mockResolvedValue({ data: { id: 'p' } })
    await feedsApi.createPost({ feed: 'f', body: 'b' })
    expect(warning).not.toHaveBeenCalled()
  })
})
