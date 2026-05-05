import { useLingui } from '@lingui/react/macro'
import type { ReactionCounts, ReactionId } from '@/types'

// Identifier-only options used for iteration / mapping (no labels here so the
// list is locale-independent; consumers that need labels use useReactionOptions).
export const reactionOptions: { id: ReactionId; emoji: string }[] = [
  { id: 'like', emoji: '👍' },
  { id: 'dislike', emoji: '👎' },
  { id: 'laugh', emoji: '😂' },
  { id: 'amazed', emoji: '😮' },
  { id: 'love', emoji: '😍' },
  { id: 'sad', emoji: '😢' },
  { id: 'angry', emoji: '😡' },
  { id: 'agree', emoji: '🤝' },
  { id: 'disagree', emoji: '🙅' },
]

export function useReactionOptions(): { id: ReactionId; label: string; emoji: string }[] {
  const { t } = useLingui()
  return [
    { id: 'like', label: t`Like`, emoji: '👍' },
    { id: 'dislike', label: t`Dislike`, emoji: '👎' },
    { id: 'laugh', label: t`Laugh`, emoji: '😂' },
    { id: 'amazed', label: t`Amazed`, emoji: '😮' },
    { id: 'love', label: t`Love`, emoji: '😍' },
    { id: 'sad', label: t`Sad`, emoji: '😢' },
    { id: 'angry', label: t`Angry`, emoji: '😡' },
    { id: 'agree', label: t`Agree`, emoji: '🤝' },
    { id: 'disagree', label: t`Disagree`, emoji: '🙅' },
  ]
}

export const createReactionCounts = (
  preset: Partial<ReactionCounts> = {}
): ReactionCounts => {
  return reactionOptions.reduce((acc, option) => {
    acc[option.id] = preset[option.id] ?? 0
    return acc
  }, {} as ReactionCounts)
}

// The STRINGS constants object was removed during Wave 4 of the i18n
// externalisation (claude/plans/languages.md). All feed UI strings now use
// Lingui macros (`<Trans>...</Trans>` for JSX, `` "..." `` for plain strings,
// `<Plural value={n} one="..." other="..." />` for counts) at the call site,
// where the extractor finds them and translators can provide localised
// values per language in apps/feeds/web/src/locales/<lang>/messages.po.
