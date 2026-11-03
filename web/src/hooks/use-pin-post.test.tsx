// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { usePinPost } from './use-pin-post'

vi.mock('@/api/feeds', () => ({ feedsApi: { pinPost: vi.fn() } }))

// A pin shows on the post at once, in the feed's list and on the post's own
// page, and goes back if the server refuses. The request waits until the test
// answers it.
let accept: () => void
let refuse: (error: unknown) => void
beforeEach(() => {
  vi.mocked(feedsApi.pinPost).mockClear()
  vi.mocked(feedsApi.pinPost).mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        accept = () => resolve({ pinned: 1 } as never)
        refuse = reject
      })
  )
})

const post = { id: 'p1', feedId: 'f1', pinned: 0 } as FeedPost
const other = { id: 'p2', feedId: 'f2', pinned: 0 } as FeedPost
const list = ['posts', 'f1', 'new']
const otherList = ['posts', 'f2', 'new']
const single = ['feeds', 'single-post', 'f1', 'p1']

function mount() {
  const client = new QueryClient()
  client.setQueryData(list, { pages: [{ posts: [post] }], pageParams: [0] })
  client.setQueryData(otherList, {
    pages: [{ posts: [other] }],
    pageParams: [0],
  })
  client.setQueryData(single, { post, isOwner: true })
  const view = renderHook(() => usePinPost(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  type Lists = { pages: Array<{ posts: FeedPost[] }> }
  const inList = () =>
    client.getQueryData<Lists>(list)?.pages[0].posts[0].pinned
  const onPage = () =>
    client.getQueryData<{ post: FeedPost }>(single)?.post.pinned
  return { client, view, inList, onPage }
}

describe('usePinPost', () => {
  it('pins at once in the list and on the post page, and unpins when refused', async () => {
    const { view, inList, onPage } = mount()

    act(() => view.result.current.mutate({ post, pinned: true }))
    await waitFor(() => expect(inList()).toBeGreaterThan(0))
    expect(onPage()).toBeGreaterThan(0)

    act(() => refuse(new Error('refused')))
    await waitFor(() => expect(view.result.current.isError).toBe(true))
    expect(inList()).toBe(0)
    expect(onPage()).toBe(0)
  })

  it('leaves a fetch of a list without the post running', async () => {
    const { client, view, inList } = mount()
    void client.prefetchQuery({
      queryKey: otherList,
      queryFn: () => new Promise(() => {}),
    })

    act(() => view.result.current.mutate({ post, pinned: true }))
    await waitFor(() => expect(inList()).toBeGreaterThan(0))
    expect(client.getQueryState(otherList)?.fetchStatus).toBe('fetching')
  })

  it('re-reads only the feed of the post once accepted', async () => {
    const { client, view } = mount()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    act(() => view.result.current.mutate({ post, pinned: true }))
    await waitFor(() => expect(feedsApi.pinPost).toHaveBeenCalled())
    act(() => accept())
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['posts', 'f1'] })
  })
})
