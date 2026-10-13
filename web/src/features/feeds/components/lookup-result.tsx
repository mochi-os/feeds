// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// A handle or link looked up from the search page: a person or community on
// another network, followed into one of the user's own feeds as a source, or
// a post there, quoted, with its author to follow.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EntityAvatar,
  QuoteCard,
  getErrorMessage,
  isInShell,
  isPermissionError,
  naturalCompare,
  providerName,
  shellRequestPermission,
  toast,
} from '@mochi/web'
import { Loader2, Plus } from 'lucide-react'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'

// What may name someone elsewhere: a handle with an @ or a ! before it, a
// bare domain-shaped Bluesky handle, an identifier, or a link that is not a
// Mochi feed's.
export function looksUpElsewhere(query: string): boolean {
  const q = query.trim()
  if (!q || /\s/.test(q) || /^mochi:/i.test(q) || q.includes('/feeds/')) {
    return false
  }
  return (
    /^(https?:\/\/|did:|[@!])/i.test(q) ||
    /^[^@/]+@[^@/]+\.[^@/]+$/.test(q) ||
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(q)
  )
}

export function LookupResult({ query }: { query: string }) {
  const { t } = useLingui()
  const enabled = looksUpElsewhere(query)
  const { data, isLoading } = useQuery({
    queryKey: ['feeds', 'lookup', query],
    queryFn: () => feedsApi.lookup(query),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  })
  if (!enabled) return null
  if (isLoading) {
    return (
      <div className='flex justify-center py-4'>
        <Loader2 className='text-muted-foreground size-5 animate-spin' />
      </div>
    )
  }
  if (!data) return null

  if (data.kind === 'post') {
    if (!data.quote) return null
    const author = data.quote.author
    const target = author?.url || author?.id
    return (
      <div className='space-y-2'>
        <QuoteCard quote={data.quote} />
        {target && (
          <div className='flex justify-end'>
            <FollowMenu
              query={target}
              label={t`Follow ${author?.name || author?.address || ''}`}
            />
          </div>
        )}
      </div>
    )
  }

  const name = data.name || data.address || query
  return (
    <div
      className='flex items-center justify-between gap-3 rounded-lg border p-3'
      data-testid='lookup-result'
    >
      <div className='flex min-w-0 items-center gap-3'>
        <EntityAvatar src={data.avatar || null} name={name} size='lg' />
        <div className='min-w-0'>
          <div className='truncate text-sm font-medium'>{name}</div>
          <div className='text-muted-foreground truncate text-xs'>
            {[
              data.address,
              providerName(data.network),
              data.kind === 'group' ? t`Community` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>
      <FollowMenu query={data.id || query} label={t`Follow`} />
    </div>
  )
}

// The feeds the user owns, one of which takes the person as a source.
function FollowMenu({ query, label }: { query: string; label: string }) {
  const { t } = useLingui()
  const feeds = useFeedsStore((state) => state.feeds).filter((f) => f.isOwner)
  const [busy, setBusy] = useState(false)

  const follow = async (feedId: string): Promise<void> => {
    setBusy(true)
    try {
      const response = await feedsApi.addSource(feedId, 'person', query)
      const count = response.data?.ingested ?? 0
      toast.success(
        count > 0
          ? plural(count, {
              one: 'Source added (# post imported)',
              other: 'Source added (# posts imported)',
            })
          : t`Source added`
      )
    } catch (err) {
      const permission = isPermissionError(
        (err as { response?: { data?: unknown } })?.response?.data
      )
      if (permission && !permission.restricted && isInShell()) {
        if ((await shellRequestPermission(permission.permission)) === 'granted') {
          setBusy(false)
          return follow(feedId)
        }
        return
      }
      toast.error(getErrorMessage(err, t`Could not follow`))
    } finally {
      setBusy(false)
    }
  }

  if (feeds.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size='sm' loading={busy} icon={<Plus className='size-4' />}>
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {[...feeds]
          .sort((a, b) => naturalCompare(a.name, b.name))
          .map((feed) => (
            <DropdownMenuItem key={feed.id} onSelect={() => void follow(feed.id)}>
              {feed.name}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
