// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// What a post is made with beyond its text (phase 17): who may see it, a
// content warning, the sensitive flag, and a poll. The composer shows all of
// them; the editor the first three, since a poll stays as it was made.
import { useId } from 'react'
import type { PostFeatures, PostPollInput, PostVisibility } from '@/types'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@mochi/web'
import { Globe, Lock, EyeOff, Plus, X } from 'lucide-react'

export const POLL_OPTIONS_MINIMUM = 2
export const POLL_OPTIONS_MAXIMUM = 8
export const POLL_OPTION_MAXIMUM = 100
export const WARNING_MAXIMUM = 500

// How long a poll runs, in seconds.
const POLL_DURATIONS = [300, 1800, 3600, 21600, 86400, 259200, 604800]

export function visibilityIcon(visibility: PostVisibility | undefined) {
  if (visibility === 'followers') return Lock
  if (visibility === 'unlisted') return EyeOff
  return Globe
}

export function PostFeaturesFields({
  value,
  onChange,
  idPrefix,
}: {
  value: PostFeatures
  onChange: (value: PostFeatures) => void
  idPrefix: string
}) {
  const { t } = useLingui()
  const visibility = value.visibility ?? 'public'
  return (
    <div className='flex flex-wrap items-end gap-3'>
      <div className='space-y-1'>
        <Label htmlFor={`${idPrefix}-visibility`}>
          <Trans>Visibility</Trans>
        </Label>
        <Select
          value={visibility}
          onValueChange={(next) =>
            onChange({ ...value, visibility: next as PostVisibility })
          }
        >
          <SelectTrigger id={`${idPrefix}-visibility`} className='w-44'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='public'>
              <Trans>Public</Trans>
            </SelectItem>
            <SelectItem value='unlisted'>
              <Trans context='post visibility'>Unlisted</Trans>
            </SelectItem>
            <SelectItem value='followers'>
              <Trans>Followers only</Trans>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='min-w-48 flex-1 space-y-1'>
        <Label htmlFor={`${idPrefix}-warning`}>
          <Trans>Content warning</Trans>
        </Label>
        <Input
          id={`${idPrefix}-warning`}
          value={value.warning ?? ''}
          maxLength={WARNING_MAXIMUM}
          onChange={(event) =>
            onChange({ ...value, warning: event.target.value })
          }
        />
      </div>
      <label className='flex items-center gap-2 pb-2 text-sm'>
        <Switch
          checked={!!value.sensitive}
          aria-label={t`Sensitive media`}
          onCheckedChange={(on) => onChange({ ...value, sensitive: on })}
        />
        <Trans>Sensitive media</Trans>
      </label>
    </div>
  )
}

export function PollEditor({
  value,
  onChange,
  onRemove,
}: {
  value: PostPollInput
  onChange: (value: PostPollInput) => void
  onRemove: () => void
}) {
  const { t } = useLingui()
  const base = useId()
  const durationLabel = (seconds: number): string => {
    if (seconds < 3600) return t`${seconds / 60} minutes`
    if (seconds < 86400) return t`${seconds / 3600} hours`
    return t`${seconds / 86400} days`
  }
  const replace = (index: number, option: string) =>
    onChange({
      ...value,
      options: value.options.map((o, i) => (i === index ? option : o)),
    })
  return (
    <div className='space-y-2 rounded-[8px] border p-3'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>
          <Trans>Poll</Trans>
        </span>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-6'
          onClick={onRemove}
          aria-label={t`Remove poll`}
        >
          <X className='size-4' />
        </Button>
      </div>
      {value.options.map((option, index) => (
        <div key={index} className='flex items-center gap-2'>
          <Input
            value={option}
            maxLength={POLL_OPTION_MAXIMUM}
            aria-label={t`Option ${index + 1}`}
            onChange={(event) => replace(index, event.target.value)}
          />
          {value.options.length > POLL_OPTIONS_MINIMUM && (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-8'
              aria-label={t`Remove option ${index + 1}`}
              onClick={() =>
                onChange({
                  ...value,
                  options: value.options.filter((_, i) => i !== index),
                })
              }
            >
              <X className='size-4' />
            </Button>
          )}
        </div>
      ))}
      <div className='flex flex-wrap items-center gap-3'>
        {value.options.length < POLL_OPTIONS_MAXIMUM && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => onChange({ ...value, options: [...value.options, ''] })}
          >
            <Plus className='size-4' />
            <Trans>Add option</Trans>
          </Button>
        )}
        <label className='flex items-center gap-2 text-sm'>
          <Switch
            checked={!!value.multiple}
            aria-label={t`Several choices`}
            onCheckedChange={(on) => onChange({ ...value, multiple: on })}
          />
          <Trans>Several choices</Trans>
        </label>
        <div className='flex items-center gap-2 text-sm'>
          <Label htmlFor={`${base}-duration`}>
            <Trans>Closes after</Trans>
          </Label>
          <Select
            value={String(value.duration ?? 86400)}
            onValueChange={(next) =>
              onChange({ ...value, duration: Number(next) })
            }
          >
            <SelectTrigger id={`${base}-duration`} className='w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POLL_DURATIONS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {durationLabel(seconds)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

/** Whether a poll as composed may be sent: every option written, no twins. */
export function pollValid(poll: PostPollInput | null): boolean {
  if (!poll) return true
  const options = poll.options.map((o) => o.trim())
  if (
    options.length < POLL_OPTIONS_MINIMUM ||
    options.length > POLL_OPTIONS_MAXIMUM
  )
    return false
  if (options.some((o) => !o)) return false
  return new Set(options.map((o) => o.toLowerCase())).size === options.length
}
