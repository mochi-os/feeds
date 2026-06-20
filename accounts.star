# Copyright © 2026 Mochi OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# Mochi feeds app: Connected accounts
# Thin wrappers around mochi.account.* API

def action_accounts_providers(a):
    capability = a.input("capability")
    a.json(mochi.account.providers(capability))

def action_accounts_list(a):
    capability = a.input("capability")
    a.json(mochi.account.list(capability))
