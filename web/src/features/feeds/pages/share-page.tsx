// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// Where another app's Share hands something to Feeds: the new post dialog,
// filled in with its text and link, for the user to pick one of their feeds
// and post. Nothing is posted until they do; posting opens the feed, and
// closing without posting goes back to where they came from.
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  EmptyState,
  Main,
  isInShell,
  shareRead,
  shellNavigateBack,
  usePageTitle,
} from '@mochi/web'
import { Plus, Rss } from 'lucide-react'
import { useFeedsStore } from '@/stores/feeds-store'
import { useSidebarContext } from '@/context/sidebar-context'
import { useCreatePost } from '@/hooks/use-create-post'
import {
  NewPostDialog,
  type NewPostInput,
} from '@/features/feeds/components/new-post-dialog'

export function SharePage() {
  const { t } = useLingui()
  usePageTitle(t`Share`)
  const navigate = useNavigate()
  const router = useRouter()
  const feeds = useFeedsStore((state) => state.feeds)
  const loaded = useFeedsStore((state) => state.loaded)
  const { openCreateFeedDialog } = useSidebarContext()
  const { submit, progress } = useCreatePost()
  const [open, setOpen] = useState(true)
  // The feed a post went to, which closing the dialog then opens.
  const posted = useRef<string | null>(null)

  // Read once: what was shared does not change while the page is open.
  const [shared] = useState(() => shareRead(window.location.search))
  const body = shared.url
    ? `${shared.text}\n\n${shared.url}`.trim()
    : shared.text

  const owned = useMemo(() => feeds.filter((feed) => feed.isOwner), [feeds])

  const post = async (input: NewPostInput) => {
    await submit(input)
    posted.current = input.feedId
  }

  const close = () => {
    setOpen(false)
    const feed = owned.find((candidate) => candidate.id === posted.current)
    if (feed) {
      void navigate({
        to: '/$feedId',
        params: { feedId: feed.fingerprint ?? feed.id.replace(/^feeds\//, '') },
        replace: true,
      })
      return
    }
    // Back to the app the share came from. A page reached from another app
    // starts this frame's history afresh, so the window's own history says
    // whether there is anywhere to go back to; with nowhere, Feeds' home.
    if (router.history.canGoBack() || window.history.length > 1) {
      if (isInShell()) shellNavigateBack()
      else router.history.back()
      return
    }
    void navigate({ to: '/', replace: true })
  }

  if (!loaded) return <Main />

  if (owned.length === 0) {
    return (
      <Main>
        <EmptyState icon={Rss} title={t`You have no feeds yet.`}>
          <Button variant='outline' onClick={openCreateFeedDialog}>
            <Plus className='size-4' />
            <Trans>Create a new feed</Trans>
          </Button>
        </EmptyState>
      </Main>
    )
  }

  return (
    <Main>
      <NewPostDialog
        feeds={owned}
        onSubmit={post}
        progress={progress}
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
        hideTrigger
        showFeedSelector
        body={body}
      />
    </Main>
  )
}
