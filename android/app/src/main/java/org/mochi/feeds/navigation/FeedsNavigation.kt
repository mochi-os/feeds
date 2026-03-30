package org.mochi.feeds.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import org.mochi.feeds.ui.feed.FeedScreen
import org.mochi.feeds.ui.feedlist.FeedListScreen
import org.mochi.feeds.ui.find.FindFeedsScreen
import org.mochi.feeds.ui.post.CreatePostScreen
import org.mochi.feeds.ui.post.PostDetailScreen
import org.mochi.feeds.ui.settings.FeedSettingsScreen

object Routes {
    const val FEED_LIST = "feedList"
    const val FEED = "feed/{feedId}"
    const val POST = "post/{feedId}/{postId}"
    const val CREATE_POST = "createPost?feedId={feedId}"
    const val FIND_FEEDS = "findFeeds"
    const val FEED_SETTINGS = "feedSettings/{feedId}"

    fun feed(feedId: String) = "feed/$feedId"
    fun post(feedId: String, postId: String) = "post/$feedId/$postId"
    fun createPost(feedId: String? = null) =
        if (feedId != null) "createPost?feedId=$feedId" else "createPost"
    fun feedSettings(feedId: String) = "feedSettings/$feedId"
}

@Composable
fun FeedsNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Routes.FEED_LIST) {
        composable(Routes.FEED_LIST) {
            FeedListScreen(
                onNavigateToFeed = { feedId -> navController.navigate(Routes.feed(feedId)) },
                onNavigateToCreatePost = { navController.navigate(Routes.createPost()) },
                onNavigateToFindFeeds = { navController.navigate(Routes.FIND_FEEDS) }
            )
        }

        composable(
            route = Routes.FEED,
            arguments = listOf(navArgument("feedId") { type = NavType.StringType })
        ) {
            FeedScreen(
                onNavigateToPost = { feedId, postId ->
                    navController.navigate(Routes.post(feedId, postId))
                },
                onNavigateToCreatePost = { feedId ->
                    navController.navigate(Routes.createPost(feedId))
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
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Routes.CREATE_POST,
            arguments = listOf(
                navArgument("feedId") {
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
