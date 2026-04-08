package org.mochi.feeds.di

import com.google.gson.Gson
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import org.mochi.android.auth.SessionManager
import org.mochi.feeds.api.FeedsApi
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import javax.inject.Qualifier
import javax.inject.Singleton

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class FeedsRetrofit

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    @FeedsRetrofit
    fun provideFeedsRetrofit(
        okHttpClient: OkHttpClient,
        gson: Gson,
        sessionManager: SessionManager
    ): Retrofit {
        val serverUrl = sessionManager.getServerUrlBlocking().trimEnd('/')
        val feedsClient = okHttpClient.newBuilder()
            .addInterceptor(Interceptor { chain ->
                val token = sessionManager.getTokenBlocking("feeds")
                val builder = chain.request().newBuilder()
                    .header("Accept", "application/json")
                if (token != null) {
                    builder.header("Authorization", "Bearer $token")
                }
                chain.proceed(builder.build())
            })
            .build()
        return Retrofit.Builder()
            .baseUrl("$serverUrl/feeds/")
            .client(feedsClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    @Provides
    @Singleton
    fun provideFeedsApi(@FeedsRetrofit retrofit: Retrofit): FeedsApi {
        return retrofit.create(FeedsApi::class.java)
    }
}
