// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// What a post says of itself above its text (phase 17): the person on
// another network who wrote it, who boosted it here, that it is pinned, and
// that it is not public.
import type { FeedPost } from '@/types'
import { Trans } from '@lingui/react/macro'
import { EntityAvatar } from '@mochi/web'
import { Pin, Repeat2 } from 'lucide-react'
import { safeHref } from '../utils'
import { visibilityIcon } from './post-features'

export function PostHeadline({ post }: { post: FeedPost }) {
  const person = post.data?.person
  const boost = post.data?.boost
  const Visibility = visibilityIcon(post.visibility)
  const badges = !!post.pinned || (post.visibility && post.visibility !== 'public')
  if (!person && !boost && !badges) return null
  const name = person?.name || person?.address || ''
  return (
    <div className='space-y-1'>
      {boost && (
        <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
          <Repeat2 className='size-3.5' />
          {boost.page ? (
            <a
              href={safeHref(boost.page)}
              target='_blank'
              rel='noopener noreferrer'
              className='hover:underline'
            >
              <Trans>Boosted by {boost.name || boost.address}</Trans>
            </a>
          ) : (
            <Trans>Boosted by {boost.name || boost.address}</Trans>
          )}
        </div>
      )}
      {person && (
        <div className='flex items-center gap-2'>
          <EntityAvatar src={person.avatar || null} name={name} size='sm' />
          <div className='min-w-0 text-sm leading-tight'>
            {person.page ? (
              <a
                href={safeHref(person.page)}
                target='_blank'
                rel='noopener noreferrer'
                className='font-medium hover:underline'
                onClick={(event) => event.stopPropagation()}
              >
                {name}
              </a>
            ) : (
              <span className='font-medium'>{name}</span>
            )}
            {person.address && person.address !== name && (
              <div className='text-muted-foreground truncate text-xs'>
                {person.address}
              </div>
            )}
          </div>
        </div>
      )}
      {badges && (
        <div className='text-muted-foreground flex flex-wrap items-center gap-3 text-xs'>
          {!!post.pinned && (
            <span className='flex items-center gap-1'>
              <Pin className='size-3.5' />
              <Trans>Pinned</Trans>
            </span>
          )}
          {post.visibility === 'followers' && (
            <span className='flex items-center gap-1'>
              <Visibility className='size-3.5' />
              <Trans>Followers only</Trans>
            </span>
          )}
          {post.visibility === 'unlisted' && (
            <span className='flex items-center gap-1'>
              <Visibility className='size-3.5' />
              <Trans context='post visibility'>Unlisted</Trans>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
