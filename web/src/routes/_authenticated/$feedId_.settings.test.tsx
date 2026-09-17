// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { SubscribersSection } from './$feedId_.settings'

vi.mock('@/api/feeds', () => ({
  feedsApi: {
    listMembers: vi.fn(),
    removeMember: vi.fn(),
    setAccessLevel: vi.fn(),
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
