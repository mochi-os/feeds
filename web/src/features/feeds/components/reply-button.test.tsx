// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplyButton } from './reply-button'

const state = vi.hoisted(() => ({
  reply: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/feeds', () => ({
  feedsApi: { reply: state.reply },
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  shellNavigateTop: state.navigate,
  toast: { success: vi.fn(), error: state.error },
}))

describe('ReplyButton', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.reply.mockReset()
    state.navigate.mockReset()
    state.error.mockReset()
  })

  it('asks for the handle and sends the visitor to their own server', async () => {
    state.reply.mockResolvedValue({
      url: 'https://their.example/authorize_interaction?uri=https://here.example/~a/o',
    })
    render(
      <I18nProvider i18n={i18n}>
        <ReplyButton feedId='f1' postId='p1' />
      </I18nProvider>
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Reply from another network' })
      )
    })
    await act(async () => {
      fireEvent.change(await screen.findByLabelText('Your handle'), {
        target: { value: '@bob@their.example' },
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    })
    await waitFor(() =>
      expect(state.reply).toHaveBeenCalledWith('f1', 'p1', '@bob@their.example')
    )
    expect(state.navigate).toHaveBeenCalledWith(
      'https://their.example/authorize_interaction?uri=https://here.example/~a/o'
    )
  })

  it('reports a server that cannot be found', async () => {
    state.reply.mockRejectedValue(new Error('nope'))
    render(
      <I18nProvider i18n={i18n}>
        <ReplyButton feedId='f1' postId='p1' />
      </I18nProvider>
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Reply from another network' })
      )
    })
    await act(async () => {
      fireEvent.change(await screen.findByLabelText('Your handle'), {
        target: { value: 'bob@nowhere.invalid' },
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    })
    await waitFor(() => expect(state.error).toHaveBeenCalled())
    expect(state.navigate).not.toHaveBeenCalled()
  })
})
