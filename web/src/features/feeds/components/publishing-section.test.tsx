// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublishingSection, usePublishOffered } from './publishing-section'

const state = vi.hoisted(() => ({
  getPublish: vi.fn(),
  setPublish: vi.fn(),
  forgetCopies: vi.fn(),
  importAccount: vi.fn(),
  setGenerator: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  allowWaiting: vi.fn(),
  request: vi.fn(),
  getBackups: vi.fn(),
  downloadBackup: vi.fn(),
}))

vi.mock('@/api/feeds', () => ({
  feedsApi: {
    getPublish: state.getPublish,
    setPublish: state.setPublish,
    forgetCopies: state.forgetCopies,
    importAccount: state.importAccount,
    allowWaiting: state.allowWaiting,
    setGenerator: state.setGenerator,
    getBackups: state.getBackups,
    downloadBackup: state.downloadBackup,
  },
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  toast: {
    success: state.success,
    error: state.error,
    info: state.info,
    loading: () => 'progress',
  },
  isInShell: () => true,
  shellRequestPermission: state.request,
}))

const accounts = [
  {
    id: 'm1',
    type: 'mastodon',
    identifier: '@alice@mastodon.social',
    name: 'Alice',
    server: 'mastodon.social',
  },
  {
    id: 'b1',
    type: 'bluesky',
    identifier: 'alice.bsky.social',
    name: 'Alice',
    server: 'bsky.social',
  },
  {
    id: 'b2',
    type: 'bluesky',
    identifier: 'alice.example.com',
    name: 'Alice',
    server: 'example.com',
    hosted: true,
  },
]

function show(privacy = 'public') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <PublishingSection feedId='feed-1' privacy={privacy} />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('Publishing section', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.getPublish.mockReset().mockResolvedValue({
      accounts,
      publish: ['m1'],
      copies: { m1: 3 },
    })
    state.setPublish.mockReset()
    state.forgetCopies.mockReset()
    state.importAccount.mockReset()
    state.setGenerator.mockReset()
    state.getBackups.mockReset().mockResolvedValue({ files: [] })
    state.success.mockReset()
    state.error.mockReset()
  })

  it('lists the accounts with a switch each, on for those the feed publishes to', async () => {
    show()
    expect(await screen.findByText('@alice@mastodon.social')).toBeTruthy()
    expect(screen.getByText('alice.bsky.social')).toBeTruthy()
    expect(screen.getByText('Mastodon · 3 copies')).toBeTruthy()
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(3)
    expect(switches[0]).toHaveAttribute('aria-checked', 'true')
    expect(switches[1]).toHaveAttribute('aria-checked', 'false')
  })

  it('publishes the feed as a Bluesky feed from a hosted Bluesky account only', async () => {
    state.setGenerator.mockResolvedValue({ generators: { b2: 'at://x' } })
    const user = userEvent.setup()
    show()
    await screen.findByText('alice.example.com')
    // A linked Bluesky account is not a generator's home.
    await user.click(
      screen.getAllByRole('button', { name: 'Account actions' })[1]
    )
    await screen.findByRole('menuitem', { name: 'Backups' })
    expect(
      screen.queryByRole('menuitem', { name: 'Publish as a Bluesky feed' })
    ).toBeNull()
    await user.keyboard('{Escape}')
    await user.click(
      screen.getAllByRole('button', { name: 'Account actions' })[2]
    )
    await user.click(
      await screen.findByRole('menuitem', { name: 'Publish as a Bluesky feed' })
    )
    await waitFor(() =>
      expect(state.setGenerator).toHaveBeenCalledWith('feed-1', 'b2', true)
    )
    expect(state.success).toHaveBeenCalledWith('Published as a Bluesky feed')
  })

  it('offers to stop publishing where the feed is a Bluesky feed already', async () => {
    state.getPublish.mockResolvedValue({
      accounts,
      publish: [],
      copies: {},
      generators: { b2: 'at://did:plc:x/app.bsky.feed.generator/1' },
    })
    state.setGenerator.mockResolvedValue({ generators: {} })
    const user = userEvent.setup()
    show()
    await screen.findByText('alice.example.com')
    await user.click(
      screen.getAllByRole('button', { name: 'Account actions' })[2]
    )
    await user.click(
      await screen.findByRole('menuitem', {
        name: 'Stop publishing as a Bluesky feed',
      })
    )
    await waitFor(() =>
      expect(state.setGenerator).toHaveBeenCalledWith('feed-1', 'b2', false)
    )
  })

  it('switching an account on adds it to the list', async () => {
    state.setPublish.mockResolvedValue({ publish: ['m1', 'b1'], kept: {} })
    show()
    await screen.findByText('alice.bsky.social')
    await act(async () => {
      fireEvent.click(screen.getAllByRole('switch')[1])
    })
    await waitFor(() =>
      expect(state.setPublish).toHaveBeenCalledWith('feed-1', ['m1', 'b1'])
    )
    expect(screen.queryByText(/Delete the copies/)).toBeNull()
  })

  it('switching an account off keeps its copies and offers to delete them', async () => {
    state.setPublish.mockResolvedValue({ publish: [], kept: { m1: 3 } })
    state.forgetCopies.mockResolvedValue({ deleted: 3 })
    show()
    await screen.findByText('@alice@mastodon.social')
    await act(async () => {
      fireEvent.click(screen.getAllByRole('switch')[0])
    })
    await waitFor(() =>
      expect(state.setPublish).toHaveBeenCalledWith('feed-1', [])
    )
    expect(
      await screen.findByText('Delete the copies on @alice@mastodon.social?')
    ).toBeTruthy()
    // Keeping is the default; deleting is the explicit choice.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete copies' }))
    })
    await waitFor(() =>
      expect(state.forgetCopies).toHaveBeenCalledWith('feed-1', 'm1')
    )
    expect(state.success).toHaveBeenCalledWith('Deleted 3 copies')
  })

  it('imports an account’s follows as sources', async () => {
    state.importAccount.mockResolvedValue({ imported: 4, more: false })
    const user = userEvent.setup()
    show()
    await screen.findByText('@alice@mastodon.social')
    await user.click(
      screen.getAllByRole('button', { name: 'Account actions' })[0]
    )
    await user.click(
      await screen.findByRole('menuitem', { name: 'Import follows as sources' })
    )
    await waitFor(() =>
      expect(state.importAccount).toHaveBeenCalledWith('feed-1', 'm1', 'follows')
    )
    expect(state.success).toHaveBeenCalledWith('Added 4 sources', {
      id: 'progress',
    })
  })

  // A person whose server the app may not read is not added by the import
  // itself: the user is asked for the server there and then, and allowing it
  // adds them. One toast says what came of both.
  const refused = {
    response: {
      data: {
        error: 'permission_required',
        app: 'feeds',
        permission: 'url:wasabi.example',
        restricted: false,
      },
    },
  }
  const importWaiting = async () => {
    state.importAccount.mockResolvedValue({
      imported: 1,
      more: false,
      waiting: [{ server: 'wasabi.example', count: 2 }],
    })
    state.allowWaiting
      .mockReset()
      .mockRejectedValueOnce(refused)
      .mockResolvedValue({ imported: 2, more: false })
    state.info.mockReset()
    const user = userEvent.setup()
    show()
    await screen.findByText('@alice@mastodon.social')
    await user.click(
      screen.getAllByRole('button', { name: 'Account actions' })[0]
    )
    await user.click(
      await screen.findByRole('menuitem', { name: 'Import follows as sources' })
    )
  }

  it('asks for each server the import left people waiting on, and adds them', async () => {
    state.request.mockReset().mockResolvedValue('granted')
    await importWaiting()
    await waitFor(() =>
      expect(state.success).toHaveBeenCalledWith('Added 3 sources', {
        id: 'progress',
      })
    )
    expect(state.request).toHaveBeenCalledWith('url:wasabi.example')
    expect(state.allowWaiting).toHaveBeenCalledWith('feed-1', 'wasabi.example')
    expect(state.info).not.toHaveBeenCalled()
  })

  it('names beneath what was added the servers the user does not allow', async () => {
    state.request.mockReset().mockResolvedValue('denied')
    await importWaiting()
    await waitFor(() =>
      expect(state.success).toHaveBeenCalledWith('Added 1 source', {
        id: 'progress',
        description: 'Waiting for permission: wasabi.example',
      })
    )
    expect(state.allowWaiting).toHaveBeenCalledTimes(1)
  })

  // Each file of an account's Backups downloads when clicked; one the shell
  // could not save says so.
  const openBackups = async () => {
    state.getBackups
      .mockReset()
      .mockResolvedValue({ files: ['posts-2026-11.jsonl'] })
    const user = userEvent.setup()
    show()
    await screen.findByText('@alice@mastodon.social')
    await user.click(
      screen.getAllByRole('button', { name: 'Account actions' })[0]
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Backups' }))
    await user.click(
      await screen.findByRole('button', { name: 'posts-2026-11.jsonl' })
    )
  }

  it('downloads a backup file when it is clicked', async () => {
    state.downloadBackup.mockReset().mockResolvedValue(true)
    await openBackups()
    await waitFor(() =>
      expect(state.downloadBackup).toHaveBeenCalledWith(
        'feed-1',
        'm1',
        'posts-2026-11.jsonl'
      )
    )
    expect(state.error).not.toHaveBeenCalled()
  })

  it('says so when a backup file could not be saved', async () => {
    state.downloadBackup.mockReset().mockResolvedValue(false)
    await openBackups()
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith('Download failed')
    )
  })

  it('says why the last backup kept no repository', async () => {
    state.getBackups.mockReset().mockResolvedValue({
      files: ['posts-2026-11.jsonl'],
      repository:
        'The repository could not be saved: bsky.example answered 400: RepoNotFound',
    })
    const user = userEvent.setup()
    show()
    await screen.findByText('@alice@mastodon.social')
    await user.click(
      screen.getAllByRole('button', { name: 'Account actions' })[0]
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Backups' }))
    expect(
      await screen.findByText(
        'The repository could not be saved: bsky.example answered 400: RepoNotFound'
      )
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'posts-2026-11.jsonl' })
    ).toBeTruthy()
  })

  it('shows nothing on a private feed', async () => {
    show('private')
    await act(async () => {})
    expect(screen.queryByText('Publish to')).toBeNull()
    expect(state.getPublish).toHaveBeenCalled()
  })
})

describe('usePublishOffered', () => {
  const offered = (privacy: string, owner: boolean) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return renderHook(() => usePublishOffered('feed-1', privacy, owner), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }).result
  }

  beforeEach(() => {
    state.getPublish.mockReset()
  })

  it("offers the tab for an owner's public feed with an account, once that is known", async () => {
    state.getPublish.mockResolvedValue({ accounts, publish: [], copies: {} })
    const result = offered('public', true)
    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('offers no tab where there is no account to publish to', async () => {
    state.getPublish.mockResolvedValue({
      accounts: [],
      publish: [],
      copies: {},
    })
    const result = offered('public', true)
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('offers the tab where the answer failed, so the error shows', async () => {
    state.getPublish.mockRejectedValue(new Error('no'))
    const result = offered('public', true)
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('offers no tab, and asks nothing, for a private feed or a subscriber', () => {
    expect(offered('private', true).current).toBe(false)
    expect(offered('public', false).current).toBe(false)
    expect(state.getPublish).not.toHaveBeenCalled()
  })
})
