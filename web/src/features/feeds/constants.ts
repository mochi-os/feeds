import type { ReactionCounts, ReactionId } from '@/types'

export const reactionOptions: { id: ReactionId; label: string; emoji: string }[] = [
  { id: 'like', label: 'Like', emoji: '👍' },
  { id: 'dislike', label: 'Dislike', emoji: '👎' },
  { id: 'laugh', label: 'Laugh', emoji: '😂' },
  { id: 'amazed', label: 'Amazed', emoji: '😮' },
  { id: 'love', label: 'Love', emoji: '😍' },
  { id: 'sad', label: 'Sad', emoji: '😢' },
  { id: 'angry', label: 'Angry', emoji: '😡' },
  { id: 'agree', label: 'Agree', emoji: '🤝' },
  { id: 'disagree', label: 'Disagree', emoji: '🙅' },
]

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
// Lingui macros (`<Trans>...</Trans>` for JSX, `` t`...` `` for plain strings,
// `<Plural value={n} one="..." other="..." />` for counts) at the call site,
// where the extractor finds them and translators can provide localised
// values per language in apps/feeds/web/src/locales/<lang>/messages.po.
