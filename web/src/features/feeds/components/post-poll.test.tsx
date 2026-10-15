// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostPoll } from './post-poll'
import { pollValid } from './post-features'

const state = vi.hoisted(() => ({ vote: vi.fn() }))

vi.mock('@/api/feeds', () => ({
  feedsApi: { votePoll: state.vote },
}))

const poll = {
  options: [
    { name: 'Tea', votes: 3 },
    { name: 'Coffee', votes: 1 },
  ],
  multiple: false,
  expires: 0,
  voters: 4,
}

function show(props: Partial<Parameters<typeof PostPoll>[0]> = {}) {
  return render(
    <I18nProvider i18n={i18n}>
      <PostPoll
        feedId='f1'
        postId='p1'
        poll={poll}
        canVote
        {...props}
      />
    </I18nProvider>
  )
}

describe('PostPoll', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.vote.mockReset()
  })

  it('offers the options and sends the choice as a vote', async () => {
    state.vote.mockResolvedValue({ post: 'p1', voted: [1] })
    const onVoted = vi.fn()
    show({ onVoted })
    expect(screen.getByRole('button', { name: 'Vote' })).toBeDisabled()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Coffee'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vote' }))
    })
    await waitFor(() => expect(state.vote).toHaveBeenCalledWith('f1', 'p1', [1]))
    expect(onVoted).toHaveBeenCalled()
  })

  it('shows the results once the reader has voted, with their choice marked', () => {
    show({ voted: [0] })
    expect(screen.queryByRole('button', { name: 'Vote' })).toBeNull()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByText('4 votes')).toBeTruthy()
  })

  it('shows the results of a closed poll and offers no vote', () => {
    show({ poll: { ...poll, expires: 1000 } })
    expect(screen.queryByRole('button', { name: 'Vote' })).toBeNull()
    expect(screen.getByText(/Closed/)).toBeTruthy()
  })
})

describe('pollValid', () => {
  it('needs two to eight distinct written options', () => {
    expect(pollValid(null)).toBe(true)
    expect(pollValid({ options: ['Tea', 'Coffee'] })).toBe(true)
    expect(pollValid({ options: ['Tea', ''] })).toBe(false)
    expect(pollValid({ options: ['Tea'] })).toBe(false)
    expect(pollValid({ options: ['Tea', 'tea'] })).toBe(false)
    expect(pollValid({ options: Array(9).fill('x').map((_, i) => `o${i}`) })).toBe(false)
  })
})
