// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { OptionsMenu } from './options-menu'

const serverError = vi.hoisted(() => vi.fn())
// What the app hands lib/web's menu.
const shared = vi.hoisted(() => ({ props: {} as Record<string, unknown> }))

vi.mock('@/api/feeds', () => ({
  feedsApi: { getNotifications: vi.fn(), setNotification: vi.fn() },
}))
// The dropdown is lib/web's; here the submenu is drawn open, with the tick as
// a plain checkbox.
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({}) }))
vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  absoluteRouteUrl: (
    _router: unknown,
    location: { to: string; params: Record<string, string> }
  ) => `https://example.org${location.to}=${Object.values(location.params)}`,
  OptionsMenu: (props: { children: ReactNode }) => {
    shared.props = props
    return <>{props.children}</>
  },
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuCheckboxItem: ({
    checked,
    disabled,
    onCheckedChange,
    children,
  }: {
    checked: boolean
    disabled: boolean
    onCheckedChange: (checked: boolean) => void
    children: ReactNode
  }) => (
    <label>
      <input
        type='checkbox'
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      {children}
    </label>
  ),
  handleServerError: serverError,
}))

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <OptionsMenu notificationsFeed='f1' />
      </QueryClientProvider>
    </I18nProvider>
  )
}

// The New posts tick moves on the click and goes back if the server refuses.
describe('OptionsMenu notifications', () => {
  let refuse: (error: unknown) => void
  beforeEach(() => {
    serverError.mockReset()
    vi.mocked(feedsApi.getNotifications).mockReset()
    vi.mocked(feedsApi.getNotifications).mockResolvedValue({
      data: { post: false },
    } as never)
    vi.mocked(feedsApi.setNotification).mockReset()
    vi.mocked(feedsApi.setNotification).mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject
      })
    )
  })

  it('ticks at once and unticks when refused', async () => {
    show()
    const tick = await screen.findByRole('checkbox', { name: 'New posts' })
    await waitFor(() => expect(tick).toBeEnabled())

    fireEvent.click(tick)
    await waitFor(() => expect(tick).toBeChecked())
    expect(feedsApi.setNotification).toHaveBeenCalledWith('f1', 'post', true)

    refuse({ response: { status: 500 } })
    await waitFor(() => expect(tick).not.toBeChecked())
    expect(serverError).toHaveBeenCalledTimes(1)
  })
})

describe('OptionsMenu Share', () => {
  it("hands the shared menu Share's words and the feed's name", () => {
    i18n.load('en', {})
    i18n.activate('en')
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <OptionsMenu entityId='abcdefghi' canShare name='Garden notes' />
        </QueryClientProvider>
      </I18nProvider>
    )
    expect(shared.props.shareLabels).toEqual({
      feed: 'Post to a feed',
      chat: 'Send in a chat',
      copy: 'Copy link',
    })
    expect(shared.props.shareName).toBe('Garden notes')
    expect(shared.props.canShare).toBe(true)
    expect((shared.props.shareUrl as () => string)()).toBe(
      'https://example.org/$feedId=abcdefghi'
    )
    expect(shared.props).not.toHaveProperty('linkTitle')
  })
})
