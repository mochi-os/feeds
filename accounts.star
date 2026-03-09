# Mochi feeds app: Connected accounts
# Thin wrappers around mochi.account.* API

def action_accounts_providers(a):
    capability = a.input("capability")
    a.json(mochi.account.providers(capability))

def action_accounts_list(a):
    capability = a.input("capability")
    a.json(mochi.account.list(capability))
