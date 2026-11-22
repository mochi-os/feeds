// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// /feeds/share, where another app's "Post to a feed" lands: the new post
// dialog filled in from the address, posting only when the user posts.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharePage } from './share-page'

const state = vi.hoisted(() => ({
  feeds: [] as unknown[],
  loaded: true,
  submit: vi.fn(),
  navigate: vi.fn(),
  canGoBack: false,
  back: vi.fn(),
  shellBack: vi.fn(),
  shell: false,
  create: vi.fn(),
}))

vi.mock('@/stores/feeds-store', () => ({
  useFeedsStore: (select: (s: unknown) => unknown) =>
    select({ feeds: state.feeds, loaded: state.loaded }),
}))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({ openCreateFeedDialog: state.create }),
}))
vi.mock('@/hooks/use-create-post', () => ({
  useCreatePost: () => ({ submit: state.submit, progress: null }),
}))
vi.mock('@/api/feeds', () => ({
  feedsApi: {
    searchMembers: vi.fn().mockResolvedValue([]),
    getPublish: vi.fn().mockResolvedValue({
      accounts: [
        {
          id: 'm1',
          type: 'mastodon',
          identifier: '@me@social.example',
          name: 'Me',
          hosted: true,
        },
        {
          id: 'b1',
          type: 'bluesky',
          identifier: 'me.bsky.example',
          name: 'Me',
          hosted: true,
        },
      ],
      publish: ['m1', 'b1'],
    }),
  },
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => state.navigate,
  useRouter: () => ({
    history: { canGoBack: () => state.canGoBack, back: state.back },
  }),
}))
vi.mock('@mochi/web', async (importOriginal) => {
  const original = await importOriginal<typeof import('@mochi/web')>()
  return {
    ...original,
    useScreenSize: () => ({ isMobile: false }),
    isInShell: () => state.shell,
    shellNavigateBack: () => state.shellBack(),
  }
})

const journal = {
  id: 'feeds/f1',
  fingerprint: 'abcdefghi',
  name: 'Journal',
  privacy: 'public',
  isOwner: true,
}

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <SharePage />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('the share address', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.feeds = [
      journal,
      { id: 'feeds/f2', name: 'Someone else', isOwner: false },
    ]
    state.loaded = true
    state.submit = vi.fn().mockResolvedValue(undefined)
    state.navigate = vi.fn()
    state.canGoBack = false
    state.back = vi.fn()
    state.shellBack = vi.fn()
    state.shell = false
    state.create = vi.fn()
    window.history.replaceState(
      null,
      '',
      '/feeds/share?text=Launch+party&url=https%3A%2F%2Fexample.org%2Fe1'
    )
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('opens the new post dialog filled in from the address', async () => {
    show()
    expect(await screen.findByLabelText('Post content')).toHaveValue(
      'Launch party\n\nhttps://example.org/e1'
    )
    // Only the user's own feeds, to choose from.
    expect(screen.getByText('Feed')).toBeTruthy()
    expect(screen.queryByText('Someone else')).toBeNull()
    expect(state.submit).not.toHaveBeenCalled()
  })

  it("posts to the chosen feed and opens that feed's page", async () => {
    show()
    await screen.findByRole('button', { name: /Also post to/ })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(state.submit).toHaveBeenCalledTimes(1))
    expect(state.submit.mock.calls[0][0]).toMatchObject({
      feedId: 'feeds/f1',
      body: 'Launch party\n\nhttps://example.org/e1',
    })
    // The feed's own Also post to, unchanged.
    expect(state.submit.mock.calls[0][0].accounts).toBeUndefined()
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith({
        to: '/$feedId',
        params: { feedId: 'abcdefghi' },
        replace: true,
      })
    )
    expect(state.back).not.toHaveBeenCalled()
  })

  it('goes back when closed without posting', async () => {
    state.canGoBack = true
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(state.back).toHaveBeenCalledTimes(1))
    expect(state.submit).not.toHaveBeenCalled()
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('goes back through the shell when inside it', async () => {
    state.canGoBack = true
    state.shell = true
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(state.shellBack).toHaveBeenCalledTimes(1))
    expect(state.back).not.toHaveBeenCalled()
  })

  it("opens Feeds' home when closed with nowhere to go back to", async () => {
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith({ to: '/', replace: true })
    )
    expect(state.back).not.toHaveBeenCalled()
    expect(state.shellBack).not.toHaveBeenCalled()
  })

  it('offers to create a feed to a user who has none', () => {
    state.feeds = [{ id: 'feeds/f2', name: 'Someone else', isOwner: false }]
    show()
    expect(screen.queryByLabelText('Post content')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create a new feed' }))
    expect(state.create).toHaveBeenCalledTimes(1)
  })
})
