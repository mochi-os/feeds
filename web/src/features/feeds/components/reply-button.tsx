// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// The reply control of a public post, for a visitor with an account on
// another network: they give their handle, and are sent to their own server's
// page for the post's copy on the fediverse, where they reply as themselves
// (the federation plan, phase 16). The follow control does the same for the
// feed's account.
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
  getErrorMessage,
  shellNavigateTop,
  toast,
} from '@mochi/web'
import { ArrowRight, Loader2, Reply } from 'lucide-react'
import { feedsApi } from '@/api/feeds'

export function ReplyButton({
  feedId,
  postId,
}: {
  feedId: string
  postId: string
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [handle, setHandle] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    const trimmed = handle.trim()
    if (!trimmed) return
    setSending(true)
    try {
      const { url } = await feedsApi.reply(feedId, postId, trimmed)
      shellNavigateTop(url)
    } catch (err) {
      toast.error(getErrorMessage(err, t`Could not find that server`))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='text-muted-foreground hover:text-foreground h-7 px-2 text-xs'
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <Reply className='size-4' />
        <Trans>Reply from another network</Trans>
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent onClick={(event) => event.stopPropagation()}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              <Trans>Reply from another network</Trans>
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <form
            className='space-y-4'
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <div className='space-y-2'>
              <Label htmlFor='reply-handle'>
                <Trans>Your handle</Trans>
              </Label>
              <Input
                id='reply-handle'
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder='@you@example.social'
                autoComplete='off'
                autoFocus
              />
            </div>
            <ResponsiveDialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setOpen(false)}
              >
                <Trans>Cancel</Trans>
              </Button>
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
