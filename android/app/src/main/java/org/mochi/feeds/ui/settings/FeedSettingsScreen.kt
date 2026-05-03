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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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

    val isPrivate = feedInfo?.privacy == "private"
    // Stable IDs drive dispatch; titles come from resources at render time
    val tabIds = buildList {
        add(SettingsTab.General)
        add(SettingsTab.Sources)
        add(SettingsTab.Access)
        if (isPrivate) add(SettingsTab.Members)
        add(SettingsTab.Ai)
    }

    // Persist tab by stable key so it survives back/forward navigation and
    // process death, and so it doesn't drift when Members appears/disappears
    // based on privacy. Positions shift; the key is constant.
    var selectedTabKey by rememberSaveable { mutableStateOf(SettingsTab.General.name) }

    // If the saved key is no longer in the visible tab set (e.g. Members was
    // removed because the feed went public), fall back to General.
    val selectedTab = tabIds.firstOrNull { it.name == selectedTabKey } ?: SettingsTab.General
    val selectedIndex = tabIds.indexOf(selectedTab).coerceAtLeast(0)

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

    // Load data for each tab when selected, keyed by tab id
    LaunchedEffect(selectedTab) {
        when (selectedTab) {
            SettingsTab.Sources -> viewModel.loadSources()
            SettingsTab.Access -> viewModel.loadAccessRules()
            SettingsTab.Members -> viewModel.loadMembers()
            SettingsTab.Ai -> viewModel.loadAiPrompts()
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
                    selectedTabIndex = selectedIndex,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    tabIds.forEachIndexed { index, tab ->
                        Tab(
                            selected = selectedIndex == index,
                            onClick = { selectedTabKey = tab.name },
                            text = { Text(stringResource(tab.titleRes), style = MaterialTheme.typography.labelMedium) }
                        )
                    }
                }

                when (selectedTab) {
                    SettingsTab.General -> GeneralTab(
                        viewModel = viewModel,
                        onFeedDeleted = onFeedDeleted
                    )
                    SettingsTab.Sources -> SourcesTab(viewModel = viewModel)
                    SettingsTab.Access -> AccessTab(viewModel = viewModel)
                    SettingsTab.Members -> MembersTab(viewModel = viewModel)
                    SettingsTab.Ai -> AiTab(viewModel = viewModel)
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
}
