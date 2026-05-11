package org.mochios.feeds.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import org.mochios.android.push.PendingDeepLink
import org.mochios.feeds.ui.feed.FeedScreen
import org.mochios.feeds.ui.feedlist.FeedListScreen
import org.mochios.feeds.ui.find.FindFeedsScreen
import org.mochios.feeds.ui.post.CreatePostScreen
import org.mochios.feeds.ui.post.PostDetailScreen
import org.mochios.feeds.ui.post.PostSourceScreen
import org.mochios.feeds.ui.settings.FeedSettingsScreen
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

object Routes {
    const val FEED_LIST = "feedList"
    const val FEED = "feed/{feedId}"
    const val POST = "post/{feedId}/{postId}"
    const val POST_SOURCE = "postSource/{feedId}/{postId}?url={url}"
    const val CREATE_POST = "createPost?feedId={feedId}&postId={postId}"
    const val FIND_FEEDS = "findFeeds"
    const val FEED_SETTINGS = "feedSettings/{feedId}"

    fun feed(feedId: String) = "feed/$feedId"
    fun post(feedId: String, postId: String) = "post/$feedId/$postId"
    fun postSource(feedId: String, postId: String, url: String): String {
        val encoded = URLEncoder.encode(url, StandardCharsets.UTF_8.name())
        return "postSource/$feedId/$postId?url=$encoded"
    }
    fun createPost(feedId: String? = null, postId: String? = null): String {
        val params = listOfNotNull(
            feedId?.let { "feedId=$it" },
            postId?.let { "postId=$it" }
        )
        return if (params.isEmpty()) "createPost" else "createPost?${params.joinToString("&")}"
    }
    fun feedSettings(feedId: String) = "feedSettings/$feedId"
}

@Composable
fun FeedsNavigation(startEntityId: String? = null, onLogout: () -> Unit = {}) {
    val navController = rememberNavController()

    // Notification tap → MainActivity stuffed the target path into PendingDeepLink.
    // Parse the second path segment as the feed id and navigate. Same logic for
    // cold-start (link held in MutableStateFlow before tree mounts) and warm
    // start (onNewIntent re-sets PendingDeepLink while the tree is alive).
    val pendingLink by PendingDeepLink.link.collectAsState()
    LaunchedEffect(pendingLink) {
        val link = pendingLink ?: return@LaunchedEffect
        val feedId = link.trim('/').split('/').getOrNull(1)
        if (!feedId.isNullOrBlank()) {
            navController.navigate(Routes.feed(feedId)) {
                launchSingleTop = true
            }
        }
        PendingDeepLink.consume()
    }

    NavHost(navController = navController, startDestination = Routes.FEED_LIST) {
        composable(Routes.FEED_LIST) {
            if (startEntityId != null) {
                androidx.compose.runtime.LaunchedEffect(Unit) {
                    navController.navigate(Routes.feed(startEntityId)) {
                        launchSingleTop = true
                    }
                }
                return@composable
            }
            FeedListScreen(
                onNavigateToFeed = { feedId -> navController.navigate(Routes.feed(feedId)) },
                onNavigateToCreatePost = { navController.navigate(Routes.createPost()) },
                onNavigateToFindFeeds = { navController.navigate(Routes.FIND_FEEDS) },
                onLogout = onLogout
            )
        }

        composable(
            route = Routes.FEED,
            arguments = listOf(navArgument("feedId") { type = NavType.StringType })
        ) {
            FeedScreen(
                onNavigateToPost = { feedId, postId, sourceUrl ->
                    if (sourceUrl != null) {
                        navController.navigate(Routes.postSource(feedId, postId, sourceUrl))
                    } else {
                        navController.navigate(Routes.post(feedId, postId))
                    }
                },
                onNavigateToCreatePost = { feedId ->
                    navController.navigate(Routes.createPost(feedId))
                },
                onNavigateToEditPost = { feedId, postId ->
                    navController.navigate(Routes.createPost(feedId = feedId, postId = postId))
                },
                onNavigateToSettings = { feedId ->
                    navController.navigate(Routes.feedSettings(feedId))
                },
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Routes.POST,
            arguments = listOf(
                navArgument("feedId") { type = NavType.StringType },
                navArgument("postId") { type = NavType.StringType }
            )
        ) {
            PostDetailScreen(
                onNavigateBack = { navController.popBackStack() },
                onEditPost = { feedId, postId ->
                    navController.navigate(Routes.createPost(feedId = feedId, postId = postId))
                }
            )
        }

        composable(
            route = Routes.POST_SOURCE,
            arguments = listOf(
                navArgument("feedId") { type = NavType.StringType },
                navArgument("postId") { type = NavType.StringType },
                navArgument("url") {
                    type = NavType.StringType
                    defaultValue = ""
                }
            )
        ) { backStackEntry ->
            val encodedUrl = backStackEntry.arguments?.getString("url").orEmpty()
            val sourceUrl = runCatching {
                java.net.URLDecoder.decode(encodedUrl, StandardCharsets.UTF_8.name())
            }.getOrDefault(encodedUrl)
            PostSourceScreen(
                sourceUrl = sourceUrl,
                onNavigateBack = { navController.popBackStack() },
                onEditPost = { feedId, postId ->
                    navController.navigate(Routes.createPost(feedId = feedId, postId = postId))
                }
            )
        }

        composable(
            route = Routes.CREATE_POST,
            arguments = listOf(
                navArgument("feedId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("postId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) {
            CreatePostScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Routes.FIND_FEEDS) {
            FindFeedsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToFeed = { feedId ->
                    navController.navigate(Routes.feed(feedId)) {
                        popUpTo(Routes.FIND_FEEDS) { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = Routes.FEED_SETTINGS,
            arguments = listOf(navArgument("feedId") { type = NavType.StringType })
        ) {
            FeedSettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onFeedDeleted = {
                    navController.popBackStack(Routes.FEED_LIST, inclusive = false)
                }
            )
        }
    }
}
