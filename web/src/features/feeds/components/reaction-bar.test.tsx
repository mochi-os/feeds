// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* eslint-disable lingui/no-unlocalized-strings -- test assertions and fixtures, not user-facing */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@lingui/react'
import { i18n } from '@lingui/core'
import { ReactionBar } from './reaction-bar'
import { createReactionCounts } from '@/features/feeds/constants'

function renderBar() {
  const counts = createReactionCounts()
  counts.like = 1
  return render(
    <I18nProvider i18n={i18n}>
      <ReactionBar counts={counts} activeReaction='like' onSelect={() => {}} />
    </I18nProvider>
  )
}

describe('ReactionBar remove label', () => {
  it('keeps the localized reaction label as-is (no JS lowercasing)', async () => {
    const user = userEvent.setup()
    renderBar()

    // Open the reaction picker.
    await user.click(screen.getByRole('button', { name: 'Add reaction' }))

    // Hover the already-selected reaction so its tooltip renders.
    const likeButton = screen.getByRole('button', { name: '👍' })
    await user.hover(likeButton)

    // Pre-fix this read "Remove like" (reaction.label.toLowerCase()); the label
    // must reach the translator's casing unchanged.
    expect(await screen.findByText('Remove Like')).toBeInTheDocument()
    expect(screen.queryByText('Remove like')).not.toBeInTheDocument()
  })
})
