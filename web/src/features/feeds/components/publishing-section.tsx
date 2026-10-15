// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// Where a public feed publishes: the owner's accounts on other networks,
// each switched on or off for the feed. Removing an account offers to delete
// the copies already there, keeping them by default. Each account's history
// can be imported into the feed, and its archive downloaded.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GeneralError,
  ListSkeleton,
  Section,
  Switch,
  getErrorMessage,
  naturalCompare,
  providerName,
  toast,
} from '@mochi/web'
import { Archive, Download, MoreHorizontal, Rss, X } from 'lucide-react'
import { feedsApi } from '@/api/feeds'
import type { PublishAccount } from '@/types/feeds'

export function PublishingSection({
  feedId,
  privacy,
}: {
  feedId: string
  privacy: string
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['feeds', 'publish', feedId],
    queryFn: () => feedsApi.getPublish(feedId),
    retry: false,
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [kept, setKept] = useState<{ account: PublishAccount; count: number } | null>(
    null
  )
  const [archive, setArchive] = useState<PublishAccount | null>(null)

  const accounts = [...(data?.accounts ?? [])].sort((a, b) =>
    naturalCompare(a.identifier, b.identifier)
  )
  const publish = data?.publish ?? []

  if (privacy !== 'public' || (!isLoading && !error && accounts.length === 0)) {
    return null
  }

  const save = async (next: string[], removed?: PublishAccount) => {
    try {
      const answer = await feedsApi.setPublish(feedId, next)
      await queryClient.invalidateQueries({ queryKey: ['feeds', 'publish', feedId] })
      await queryClient.invalidateQueries({ queryKey: ['feeds'] })
      if (removed && answer.kept[removed.id]) {
        setKept({ account: removed, count: answer.kept[removed.id] })
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t`Could not change where the feed publishes`))
    }
  }

  const toggle = async (account: PublishAccount, on: boolean) => {
    setBusy(account.id)
    const next = on
      ? [...publish, account.id]
      : publish.filter((id) => id !== account.id)
    await save(next, on ? undefined : account)
    setBusy(null)
  }

  const forget = async (account: PublishAccount) => {
    try {
      const answer = await feedsApi.forgetCopies(feedId, account.id)
      toast.success(t`Deleted ${answer.deleted} copies`)
      await refetch()
    } catch (err) {
      toast.error(getErrorMessage(err, t`Could not delete the copies`))
    }
  }

  // Whether the feed is published as a Bluesky custom feed from a hosted
  // Bluesky account: a generator record there, which Bluesky asks this server
  // for the feed's posts through (phase 19).
  const toggleGenerator = async (account: PublishAccount, on: boolean) => {
    setBusy(account.id)
    try {
      await feedsApi.setGenerator(feedId, account.id, on)
      await queryClient.invalidateQueries({ queryKey: ['feeds', 'publish', feedId] })
      toast.success(
        on ? t`Published as a Bluesky feed` : t`No longer a Bluesky feed`
      )
    } catch (err) {
      toast.error(getErrorMessage(err, t`Could not change the Bluesky feed`))
    } finally {
      setBusy(null)
    }
  }

  const importFrom = async (
    account: PublishAccount,
    kind: 'posts' | 'bookmarks' | 'follows'
  ) => {
    setBusy(account.id)
    try {
      const answer = await feedsApi.importAccount(feedId, account.id, kind)
      if (kind === 'follows') {
        toast.success(
          answer.more
            ? t`Added ${answer.imported} sources so far; the rest follow`
            : plural(answer.imported, {
                one: 'Added # source',
                other: 'Added # sources',
              })
        )
        await queryClient.invalidateQueries({
          queryKey: ['feeds', 'sources', feedId],
        })
        return
      }
      toast.success(
        answer.more
          ? t`Imported ${answer.imported} so far; the rest follow`
          : t`Imported ${answer.imported}`
      )
      await queryClient.invalidateQueries({ queryKey: ['posts', feedId] })
    } catch (err) {
      toast.error(getErrorMessage(err, t`Could not import`))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title={t`Publish to`}>
      {error ? (
        <GeneralError error={error} minimal mode='inline' reset={refetch} />
      ) : isLoading ? (
        <ListSkeleton variant='simple' height='h-9' count={2} />
      ) : (
        <div className='divide-y-0'>
          {accounts.map((account) => (
            <div
              key={account.id}
              className='flex items-center justify-between gap-4 py-2'
            >
              <div className='min-w-0'>
                <div className='truncate text-sm font-medium'>
                  {account.identifier}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {providerName(account.type)}
                  {data?.copies[account.id]
                    ? ' · ' +
                      plural(data.copies[account.id], {
                        one: '# copy',
                        other: '# copies',
                      })
                    : ''}
                </div>
              </div>
              <div className='flex items-center gap-2'>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant='ghost'
                      size='sm'
                      icon={<MoreHorizontal className='h-4 w-4' />}
                      aria-label={t`Account actions`}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuItem
                      onClick={() => void importFrom(account, 'posts')}
                    >
                      <Download className='me-2 h-4 w-4' />
                      <Trans>Import posts</Trans>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void importFrom(account, 'bookmarks')}
                    >
                      <Download className='me-2 h-4 w-4' />
                      <Trans>Import bookmarks</Trans>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void importFrom(account, 'follows')}
                    >
                      <Download className='me-2 h-4 w-4' />
                      <Trans>Import follows as sources</Trans>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setArchive(account)}>
                      <Archive className='me-2 h-4 w-4' />
                      <Trans>Backups</Trans>
                    </DropdownMenuItem>
                    {account.hosted &&
                      account.type === 'bluesky' &&
                      (data?.generators?.[account.id] ? (
                        <DropdownMenuItem
                          onClick={() => void toggleGenerator(account, false)}
                        >
                          <Rss className='me-2 h-4 w-4' />
                          <Trans>Stop publishing as a Bluesky feed</Trans>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => void toggleGenerator(account, true)}
                        >
                          <Rss className='me-2 h-4 w-4' />
                          <Trans>Publish as a Bluesky feed</Trans>
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Switch
                  checked={publish.includes(account.id)}
                  disabled={busy === account.id}
                  aria-label={t`Publish to ${account.identifier}`}
                  onCheckedChange={(on) => void toggle(account, on)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {kept && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setKept(null)
          }}
          title={t`Delete the copies on ${kept.account.identifier}?`}
          desc={t`The feed published ${kept.count} posts there. They stay unless you delete them.`}
          confirmText={t`Delete copies`}
          cancelBtnText={t`Keep`}
          icon={<Archive className='size-4' />}
          destructive
          handleConfirm={async () => {
            const account = kept.account
            setKept(null)
            await forget(account)
          }}
        />
      )}
      {archive && (
        <BackupsDialog
          feedId={feedId}
          account={archive}
          onOpenChange={(open) => {
            if (!open) setArchive(null)
          }}
        />
      )}
    </Section>
  )
}

// The archive files kept for an account, each a download.
function BackupsDialog({
  feedId,
  account,
  onOpenChange,
}: {
  feedId: string
  account: PublishAccount
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useLingui()
  const { data, isLoading } = useQuery({
    queryKey: ['feeds', 'backups', feedId, account.id],
    queryFn: () => feedsApi.getBackups(feedId, account.id),
  })
  const files = data?.files ?? []
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={t`Backups of ${account.identifier}`}
      desc={
        isLoading ? (
          <ListSkeleton variant='simple' height='h-6' count={2} />
        ) : files.length === 0 ? (
          <Trans>No backup has been made yet. One is made each day.</Trans>
        ) : (
          <ul className='space-y-1'>
            {files.map((name) => (
              <li key={name}>
                <a
                  className='text-primary underline underline-offset-4'
                  href={feedsApi.backupFileUrl(feedId, account.id, name)}
                  download={name}
                >
                  {name}
                </a>
              </li>
            ))}
          </ul>
        )
      }
      confirmText={t`Close`}
      icon={<X className='size-4' />}
      handleConfirm={() => onOpenChange(false)}
    />
  )
}
