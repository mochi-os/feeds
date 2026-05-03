package org.mochi.feeds.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import org.mochi.feeds.R
import org.mochi.android.R as MochiR

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedSettingsScreen(
    onNavigateBack: () -> Unit,
    onFeedDeleted: () -> Unit,
    viewModel: FeedSettingsViewModel = hiltViewModel()
) {
    val feedInfo by viewModel.feedInfo.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val actionMessage by viewModel.actionMessage.collectAsState()

    var selectedTab by remember { mutableIntStateOf(0) }
    val isPrivate = feedInfo?.privacy == "private"
    // Stable IDs drive dispatch; titles come from resources at render time
    val tabIds = buildList {
        add(SettingsTab.General)
        add(SettingsTab.Sources)
        add(SettingsTab.Access)
        if (isPrivate) add(SettingsTab.Members)
        add(SettingsTab.Ai)
        add(SettingsTab.Notifications)
    }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(error) {
        error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }

    LaunchedEffect(actionMessage) {
        actionMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearActionMessage()
        }
    }

    // Load data for each tab when selected, keyed by tab id (positions shift with Members tab)
    LaunchedEffect(selectedTab, tabIds) {
        when (tabIds.getOrNull(selectedTab)) {
            SettingsTab.Sources -> viewModel.loadSources()
            SettingsTab.Access -> viewModel.loadAccessRules()
            SettingsTab.Members -> viewModel.loadMembers()
            SettingsTab.Ai -> viewModel.loadAiPrompts()
            SettingsTab.Notifications -> viewModel.loadNotificationSettings()
            else -> { }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Text(feedInfo?.name ?: stringResource(R.string.feeds_settings))
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(MochiR.string.common_back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (isLoading && feedInfo == null) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else {
                TabRow(
                    selectedTabIndex = selectedTab,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    tabIds.forEachIndexed { index, tab ->
                        Tab(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            text = { Text(stringResource(tab.titleRes), style = MaterialTheme.typography.labelMedium) }
                        )
                    }
                }

                when (tabIds.getOrNull(selectedTab)) {
                    SettingsTab.General -> GeneralTab(
                        viewModel = viewModel,
                        onFeedDeleted = onFeedDeleted
                    )
                    SettingsTab.Sources -> SourcesTab(viewModel = viewModel)
                    SettingsTab.Access -> AccessTab(viewModel = viewModel)
                    SettingsTab.Members -> MembersTab(viewModel = viewModel)
                    SettingsTab.Ai -> AiTab(viewModel = viewModel)
                    SettingsTab.Notifications -> NotificationsTab(viewModel = viewModel)
                    null -> { }
                }
            }
        }
    }
}

private enum class SettingsTab(val titleRes: Int) {
    General(R.string.feeds_tab_general),
    Sources(R.string.feeds_tab_sources),
    Access(R.string.feeds_tab_access),
    Members(R.string.feeds_tab_members),
    Ai(R.string.feeds_tab_ai),
    Notifications(R.string.feeds_tab_notifications),
}
