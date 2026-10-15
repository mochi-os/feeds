// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// Keyword filters on a feed (phase 17): a post naming one of the phrases is
// hidden from the reader who set it, on their own feeds and the ones they
// subscribe to alike.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  FieldRow,
  Input,
  Section,
  getErrorMessage,
  naturalCompare,
  toast,
} from '@mochi/web'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { feedsApi } from '@/api/feeds'

export function FiltersSection({ feedId }: { feedId: string }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['feeds', 'filters', feedId],
    queryFn: () => feedsApi.getFilters(feedId),
    retry: false,
  })
  const filters = [...(data?.filters ?? [])].sort((a, b) =>
    naturalCompare(a.phrase, b.phrase)
  )
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const changed = async () => {
    await queryClient.invalidateQueries({ queryKey: ['feeds', 'filters', feedId] })
    await queryClient.invalidateQueries({ queryKey: ['posts', feedId] })
  }

  const add = async () => {
    const value = phrase.trim()
    if (!value) return
    setBusy('add')
    try {
      await feedsApi.addFilter(feedId, value)
      setPhrase('')
      await changed()
    } catch (error) {
      toast.error(getErrorMessage(error, t`Could not add the filter`))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    setBusy(id)
    try {
      await feedsApi.removeFilter(feedId, id)
      await changed()
    } catch (error) {
      toast.error(getErrorMessage(error, t`Could not remove the filter`))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title={t`Filters`}>
      <div className='space-y-3'>
        {filters.map((filter) => (
          <FieldRow key={filter.id} label={filter.phrase} inline>
            <Button
              variant='outline'
              size='sm'
              disabled={busy === filter.id}
              onClick={() => void remove(filter.id)}
              aria-label={t`Remove ${filter.phrase}`}
            >
              {busy === filter.id ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <Trash2 className='size-4' />
              )}
            </Button>
          </FieldRow>
        ))}
        <div className='flex items-center gap-2'>
          <Input
            value={phrase}
            maxLength={100}
            aria-label={t`Phrase to hide`}
            onChange={(event) => setPhrase(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void add()
              }
            }}
          />
          <Button
            size='sm'
            disabled={!phrase.trim() || busy === 'add'}
            onClick={() => void add()}
          >
            {busy === 'add' ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <Plus className='size-4' />
            )}
            <Trans>Add</Trans>
          </Button>
        </div>
      </div>
    </Section>
  )
}
