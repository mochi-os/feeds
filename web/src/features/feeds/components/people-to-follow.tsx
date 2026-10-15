// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// The user's contacts with a handle on another network (phase 17), offered
// on the search page as people to follow into one of the user's feeds.
import { useQuery } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import { EntityAvatar, naturalCompare, providerName } from '@mochi/web'
import { Check } from 'lucide-react'
import { feedsApi } from '@/api/feeds'
import { FollowMenu } from './lookup-result'

export function PeopleToFollow() {
  const { t } = useLingui()
  const { data } = useQuery({
    queryKey: ['feeds', 'people'],
    queryFn: () => feedsApi.people(),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const people = [...(data?.people ?? [])].sort((a, b) =>
    naturalCompare(a.name || a.handle, b.name || b.handle)
  )
  if (people.length === 0) return null
  return (
    <section className='space-y-2' data-testid='people-to-follow'>
      <h2 className='text-sm font-semibold'>
        <Trans>People you know</Trans>
      </h2>
      <div className='divide-y rounded-lg border'>
        {people.map((person) => (
          <div
            key={`${person.contact}/${person.handle}`}
            className='flex items-center justify-between gap-3 p-3'
          >
            <div className='flex min-w-0 items-center gap-3'>
              <EntityAvatar
                src={person.avatar || null}
                name={person.name || person.handle}
                size='lg'
              />
              <div className='min-w-0'>
                <div className='truncate text-sm font-medium'>
                  {person.name || person.handle}
                </div>
                <div className='text-muted-foreground truncate text-xs'>
                  {[person.address || person.handle, providerName(person.network)]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
            {person.followed ? (
              <span className='text-muted-foreground flex items-center gap-1 text-xs'>
                <Check className='size-4' />
                <Trans>Following</Trans>
              </span>
            ) : (
              <FollowMenu query={person.id || person.handle} label={t`Follow`} />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
