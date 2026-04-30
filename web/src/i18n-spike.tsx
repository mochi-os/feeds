/* Wave 0 Lingui spike. Verifies the toolchain end-to-end:
 * pnpm i18n:extract picks up the strings below into src/locales/<lang>/messages.po;
 * a hand-crafted fr messages.po renders in vite dev.
 * Remove or repurpose this file once Wave 4 (feeds web externalisation) lands.
 */
import { Trans, Plural, useLingui } from '@lingui/react/macro'

export function I18nSpike({ count }: { count: number }) {
  const { t } = useLingui()
  return (
    <>
      <button title={t`Save the form`}>
        <Trans>Save</Trans>
      </button>
      <p>
        <Plural value={count} one="# unread post" other="# unread posts" />
      </p>
    </>
  )
}
