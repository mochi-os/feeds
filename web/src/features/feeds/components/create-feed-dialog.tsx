// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import {
  CreateEntityDialog,
  type CreateEntityValues,
  toastAction,
  getErrorMessage,
} from '@mochi/web'
import { Rss } from 'lucide-react'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'

type CreateFeedDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
}

export function CreateFeedDialog({
  open,
  onOpenChange,
  hideTrigger,
}: CreateFeedDialogProps) {
  const { t } = useLingui()
  const [isPending, setIsPending] = useState(false)
  const navigate = useNavigate()
  const refreshFeeds = useFeedsStore((state) => state.refresh)

  const handleSubmit = async (values: CreateEntityValues) => {
    setIsPending(true)
    try {
      const response = await toastAction(
        feedsApi.create({
          name: values.name,
          privacy: values.privacy ?? 'public',
          memories: values.toggles?.memories !== false,
        }),
        {
          loading: t`Creating feed...`,
          success: t`Feed created`,
          error: (e) => getErrorMessage(e, t`Failed to create feed`),
        }
      )

      const fingerprint = response.data?.fingerprint
      void refreshFeeds()

      if (fingerprint) {
        void navigate({ to: '/$feedId', params: { feedId: fingerprint } })
      } else {
        void navigate({ to: '/' })
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Rss}
      title={t`Create feed`}
      entityLabel={t`Feed`}
      showPrivacyToggle
      privacyLabel={t`Allow anyone to search for feed`}
      extraToggles={[
        {
          name: 'memories',
          label: t`Enable memories`,
          defaultValue: true,
        },
      ]}
      onSubmit={handleSubmit}
      isPending={isPending}
      hideTrigger={hideTrigger}
    />
  )
}
