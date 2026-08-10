// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// Shell storage for the feeds app - remembers the last visited feed.
// null means the "All Feeds" view, a feed ID means a specific feed.
import { createLastEntityStorage } from '@mochi/web'

const storage = createLastEntityStorage('mochi-feeds-last')

export const setLastFeed = storage.set
export const getLastFeed = storage.get
export const clearLastFeed = storage.clear
