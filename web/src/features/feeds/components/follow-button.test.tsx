// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FollowButton } from './follow-button'

const state = vi.hoisted(() => ({
  follow: vi.fn(),
  shell: true,
  top: vi.fn(),
  external: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/feeds', () => ({
  feedsApi: { follow: state.follow },
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  toast: { success: vi.fn(), error: state.error },
  isInShell: () => state.shell,
  shellNavigateTop: state.top,
  shellOpenExternal: state.external,
}))

const page = 'https://mastodon.social/authorize_interaction?uri=feed%40here.example'

function show() {
  render(
    <I18nProvider i18n={i18n}>
      <FollowButton feedId='f1' accounts={[{ address: 'feed@here.example', url: '' }]} />
    </I18nProvider>
  )
}

async function follow() {
  const user = userEvent.setup()
  show()
  await user.click(screen.getByRole('button', { name: 'Follow' }))
  await user.type(screen.getByLabelText('Your handle'), '@me@mastodon.social')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

// The page that follows the feed is on the visitor's own server, another
// origin: the shell never navigates its window there, so a signed-in visitor
// gets it in a new tab, and a link to click where the browser blocks that.
describe('FollowButton', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.follow.mockReset().mockResolvedValue({ url: page })
    state.top.mockReset()
    state.external.mockReset()
    state.error.mockReset()
  })

  it('sends a visitor in the top window to their server', async () => {
    state.shell = false
    await follow()
    await waitFor(() => expect(state.top).toHaveBeenCalledWith(page))
    expect(state.external).not.toHaveBeenCalled()
  })

  it('opens the page in a new tab for a visitor in the shell, and closes', async () => {
    state.shell = true
    state.external.mockReturnValue(true)
    await follow()
    await waitFor(() => expect(state.external).toHaveBeenCalledWith(page))
    expect(state.top).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByLabelText('Your handle')).toBeNull())
  })

  it('leaves a link to the page when the browser blocks the new tab', async () => {
    state.shell = true
    state.external.mockReturnValue(false)
    await follow()
    const link = await screen.findByRole('link', { name: 'Continue on mastodon.social' })
    expect(link.getAttribute('href')).toBe(page)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByLabelText('Your handle')).toBeTruthy()
  })
})
