// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { toast } from '@mochi/web'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { feedsApi } from '@/api/feeds'
import {
  PrivacyRow,
  SubscribersSection,
  settingsTabs,
} from './$feedId_.settings'

vi.mock('@/api/feeds', () => ({
  feedsApi: {
    listMembers: vi.fn(),
    removeMember: vi.fn(),
    setAccessLevel: vi.fn(),
    setPrivacy: vi.fn(),
  },
}))
vi.mock('@/stores/feeds-store', () => ({
  useFeedsStore: { getState: () => ({ refresh: vi.fn() }) },
}))

const members = [
  { id: 'owner-1', name: 'Owner Person' },
  { id: 'sub-1', name: 'Subscriber One' },
]

function renderSection(canRemove: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <SubscribersSection
          feedId='f1'
          ownerId='owner-1'
          canRemove={canRemove}
        />
      </QueryClientProvider>
    </I18nProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(feedsApi.listMembers).mockResolvedValue({
    data: { members },
  } as never)
})

describe('SubscribersSection', () => {
  it('renders the roster and never offers to remove the owner', async () => {
    renderSection(true)

    await screen.findByText('Subscriber One')
    expect(screen.getByText('Owner Person')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
    // Avatars come through the feed's own roster route, never cross-app.
    expect(
      document.querySelector('img[src*="/f1/-/members/sub-1/asset/avatar"]')
    ).not.toBeNull()
    expect(
      screen.queryByRole('button', { name: /Remove Owner Person/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Block Owner Person/ })
    ).not.toBeInTheDocument()
  })

  it('hides the remove and block controls on every row when canRemove is false', async () => {
    renderSection(false)

    await screen.findByText('Subscriber One')
    expect(
      screen.queryByRole('button', { name: /Remove/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Block/ })
    ).not.toBeInTheDocument()
  })

  it('blocks a subscriber through the No access level after the confirm dialog is accepted', async () => {
    vi.mocked(feedsApi.setAccessLevel).mockResolvedValue({
      data: { success: true },
    } as never)
    const user = userEvent.setup()
    renderSection(true)

    await user.click(
      await screen.findByRole('button', { name: /Block Subscriber One/ })
    )
    await user.click(await screen.findByRole('button', { name: 'Block' }))

    await waitFor(() =>
      expect(feedsApi.setAccessLevel).toHaveBeenCalledWith(
        'f1',
        'sub-1',
        'none'
      )
    )
    expect(feedsApi.removeMember).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('removes a subscriber after the confirm dialog is accepted', async () => {
    vi.mocked(feedsApi.removeMember).mockResolvedValue({
      data: { success: true },
    } as never)
    const user = userEvent.setup()
    renderSection(true)

    await user.click(
      await screen.findByRole('button', { name: /Remove Subscriber One/ })
    )
    await user.click(await screen.findByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(feedsApi.removeMember).toHaveBeenCalledWith('f1', 'sub-1')
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('keeps the subscriber listed when removal fails', async () => {
    vi.mocked(feedsApi.removeMember).mockRejectedValue(new Error('nope'))
    const user = userEvent.setup()
    renderSection(true)

    await user.click(
      await screen.findByRole('button', { name: /Remove Subscriber One/ })
    )
    await user.click(await screen.findByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(feedsApi.removeMember).toHaveBeenCalled())
    expect(screen.getByText('Subscriber One')).toBeInTheDocument()
  })

  it('shows the inline error view when the roster fails to load', async () => {
    vi.mocked(feedsApi.listMembers).mockRejectedValue(new Error('offline'))
    renderSection(true)

    await screen.findByRole('status')
    expect(screen.queryByText('Subscriber One')).not.toBeInTheDocument()
  })
})

describe('settingsTabs', () => {
  it('puts Publish to before Access where the feed has somewhere to publish', () => {
    expect(settingsTabs(undefined, true)).toEqual({
      tabs: ['general', 'publish', 'access'],
      active: 'general',
    })
    expect(settingsTabs('publish', true).active).toBe('publish')
  })

  it('leaves Publish to out where there is nowhere to publish, and opens the settings for a link to it', () => {
    expect(settingsTabs('publish', false)).toEqual({
      tabs: ['general', 'access'],
      active: 'general',
    })
    expect(settingsTabs('access', false).active).toBe('access')
  })

  it('keeps a link to Publish to while that is asked', () => {
    expect(settingsTabs('publish', undefined)).toEqual({
      tabs: ['general', 'publish', 'access'],
      active: 'publish',
    })
    expect(settingsTabs(undefined, undefined).tabs).toEqual([
      'general',
      'access',
    ])
  })
})

// A feed's privacy is changed after it is made, and Publish to is asked again,
// since only a public feed publishes.
describe('PrivacyRow', () => {
  function show(privacy: string, onChanged = vi.fn()) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['feeds', 'publish', 'f1'], { accounts: [] })
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <PrivacyRow feedId='f1' privacy={privacy} onChanged={onChanged} />
        </QueryClientProvider>
      </I18nProvider>
    )
    return { client, onChanged }
  }

  it('makes a public feed private, and asks Publish to again', async () => {
    vi.mocked(feedsApi.setPrivacy).mockResolvedValue({ privacy: 'private' })
    const user = userEvent.setup()
    const { client, onChanged } = show('public')
    const toggle = screen.getByRole('switch', {
      name: 'Allow anyone to search for feed',
    })
    expect(toggle).toBeChecked()
    await user.click(toggle)
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('private'))
    expect(feedsApi.setPrivacy).toHaveBeenCalledWith('f1', 'private')
    expect(
      client.getQueryState(['feeds', 'publish', 'f1'])?.isInvalidated
    ).toBe(true)
  })

  it('makes a private feed public', async () => {
    vi.mocked(feedsApi.setPrivacy).mockResolvedValue({ privacy: 'public' })
    const user = userEvent.setup()
    const { onChanged } = show('private')
    await user.click(
      screen.getByRole('switch', { name: 'Allow anyone to search for feed' })
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('public'))
    expect(feedsApi.setPrivacy).toHaveBeenCalledWith('f1', 'public')
  })

  it("shows the server's refusal and changes nothing", async () => {
    vi.mocked(feedsApi.setPrivacy).mockRejectedValue(
      new Error('Not feed owner')
    )
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    const user = userEvent.setup()
    const { onChanged } = show('public')
    await user.click(
      screen.getByRole('switch', { name: 'Allow anyone to search for feed' })
    )
    await waitFor(() => expect(error).toHaveBeenCalledWith('Not feed owner'))
    expect(onChanged).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
