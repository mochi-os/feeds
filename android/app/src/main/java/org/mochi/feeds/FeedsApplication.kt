package org.mochi.feeds

import android.app.Application
import android.content.Context
import dagger.hilt.android.HiltAndroidApp
import org.mochi.android.i18n.AppContext
import org.mochi.android.i18n.LanguageStore
import org.mochi.android.i18n.LocaleHelper

@HiltAndroidApp
class FeedsApplication : Application() {

    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(LocaleHelper.wrap(base, LanguageStore.get(base)))
    }

    override fun onCreate() {
        super.onCreate()
        AppContext.set(this)
        LocaleHelper.apply(this, LanguageStore.get(this))
    }
}
