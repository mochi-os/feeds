// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* Wave 0 Lingui spike. Verifies the toolchain end-to-end:
 * pnpm i18n:extract picks up the strings below into src/locales/<lang>/messages.po;
 * a hand-crafted fr messages.po renders in vite dev.
 * Remove or repurpose this file once Wave 4 (feeds web externalisation) lands.
 */
import { Trans, Plural } from '@lingui/react/macro'
import { t } from '@lingui/core/macro'

export function I18nSpike({ count }: { count: number }) {
  return (
    <>
      <button title={t`Save the form`}>
        <Trans><Trans>Save</Trans></Trans>
      </button>
      <p>
        <Plural value={count} one="# unread post" other="# unread posts" />
      </p>
    </>
  )
}
