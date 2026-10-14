// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// The follow control of a public feed page, for a visitor with an account on
// another network: they give their handle, and are sent to their own server's
// page that follows the feed's hosted account (the federation plan, phase 15).
import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  Input,
  Label,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  getErrorMessage,
  shellNavigateTop,
  toast,
} from '@mochi/web'
import { ArrowRight, Loader2, UserPlus } from 'lucide-react'
import { feedsApi } from '@/api/feeds'
import type { FollowAccount } from '@/types'

export function FollowButton({
  feedId,
  accounts,
}: {
  feedId: string
  accounts: FollowAccount[]
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [handle, setHandle] = useState('')
  const [account, setAccount] = useState(accounts[0]?.address ?? '')
  const [sending, setSending] = useState(false)

  if (accounts.length === 0) return null

  const submit = async () => {
    const trimmed = handle.trim()
    if (!trimmed) return
    setSending(true)
    try {
      const { url } = await feedsApi.follow(feedId, trimmed, account)
      shellNavigateTop(url)
    } catch (err) {
      toast.error(getErrorMessage(err, t`Could not find that server`))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
        <UserPlus className='size-4 md:me-2' />
        <span className='hidden md:inline'>
          <Trans>Follow</Trans>
        </span>
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              <Trans>Follow from another network</Trans>
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <form
            className='space-y-4'
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            {accounts.length > 1 && (
              <div className='space-y-2'>
                <Label htmlFor='follow-account'>
                  <Trans>Account to follow</Trans>
                </Label>
                <Select value={account} onValueChange={setAccount}>
                  <SelectTrigger id='follow-account'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.address} value={a.address}>
                        @{a.address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className='space-y-2'>
              <Label htmlFor='follow-handle'>
                <Trans>Your handle</Trans>
              </Label>
              <Input
                id='follow-handle'
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder='@you@example.social'
                autoComplete='off'
                autoFocus
              />
            </div>
            <ResponsiveDialogFooter>
              <Button type='submit' disabled={sending || !handle.trim()}>
                {sending ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <ArrowRight className='size-4' />
                )}
                <Trans>Continue</Trans>
              </Button>
            </ResponsiveDialogFooter>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )
}
