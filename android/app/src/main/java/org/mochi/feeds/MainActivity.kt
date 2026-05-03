package org.mochi.feeds

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import org.mochi.android.auth.AuthRepository
import org.mochi.android.auth.AuthResult
import org.mochi.android.auth.SessionManager
import org.mochi.android.i18n.LanguageRepository
import org.mochi.android.i18n.LanguageStore
import org.mochi.android.i18n.LocaleHelper
import org.mochi.android.ui.theme.MochiTheme
import org.mochi.android.ui.theme.ThemeRepository
import org.mochi.feeds.navigation.FeedsNavigation
import javax.inject.Inject
import org.mochi.android.R as MochiR

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var sessionManager: SessionManager

    @Inject
    lateinit var authRepository: AuthRepository

    @Inject
    lateinit var themeRepository: ThemeRepository

    @Inject
    lateinit var languageRepository: LanguageRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val startEntityId = intent?.getStringExtra("entityId")
        setContent {
            val themeAnchors by sessionManager.themeAnchors.collectAsState(initial = null)
            MochiTheme(themeAnchors = themeAnchors) {
                AppRoot(
                    sessionManager = sessionManager,
                    authRepository = authRepository,
                    themeRepository = themeRepository,
                    languageRepository = languageRepository,
                    startEntityId = startEntityId
                )
            }
        }
    }
}

@Composable
fun AppRoot(
    sessionManager: SessionManager,
    authRepository: AuthRepository,
    themeRepository: ThemeRepository,
    languageRepository: LanguageRepository,
    startEntityId: String? = null
) {
    val activity = (LocalContext.current as? androidx.activity.ComponentActivity)
    val isAuthenticated by sessionManager.isAuthenticated.collectAsState(initial = null)
    var tokenFetched by remember { mutableStateOf(false) }
    var authCompleted by remember { mutableStateOf(false) }

    when (isAuthenticated) {
        null -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        false -> {
            AuthScreen(
                sessionManager = sessionManager,
                authRepository = authRepository,
                onAuthComplete = { authCompleted = true }
            )
        }
        true -> {
            if (!tokenFetched && !authCompleted) {
                tokenFetched = true
            }

            if (authCompleted && !tokenFetched) {
                LaunchedEffect(Unit) {
                    try {
                        authRepository.fetchToken("feeds")
                    } catch (_: Exception) { }
                    themeRepository.fetchAndCacheTheme()
                    val previousTag = LanguageStore.get(activity ?: return@LaunchedEffect)
                    val newTag = languageRepository.fetchAndStore()
                    if (newTag != null && newTag != previousTag) {
                        LocaleHelper.apply(activity, newTag)
                        activity.recreate()
                        return@LaunchedEffect
                    }
                    tokenFetched = true
                }
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                LaunchedEffect(Unit) {
                    if (!authCompleted) {
                        try {
                            authRepository.fetchToken("feeds")
                        } catch (_: Exception) { }
                        themeRepository.fetchAndCacheTheme()
                    }
                }
                FeedsNavigation(startEntityId = startEntityId)
            }
        }
    }
}

@Composable
fun AuthScreen(
    sessionManager: SessionManager,
    authRepository: AuthRepository,
    onAuthComplete: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val serverUrl by sessionManager.serverUrl.collectAsState(initial = "https://mochi-os.org")
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var step by remember { mutableStateOf("email") }
    var error by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var identityName by remember { mutableStateOf("") }
    var serverInput by remember { mutableStateOf(serverUrl) }
    var showServerInput by remember { mutableStateOf(false) }

    LaunchedEffect(serverUrl) {
        serverInput = serverUrl
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(PaddingValues(horizontal = 24.dp, vertical = 48.dp)),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineLarge
        )
        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = serverInput,
            onValueChange = {
                serverInput = it
                scope.launch { sessionManager.setServerUrl(it) }
            },
            label = { Text(stringResource(MochiR.string.auth_server_url)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        Spacer(modifier = Modifier.height(16.dp))

        when (step) {
            "email" -> {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it; error = null },
                    label = { Text(stringResource(MochiR.string.auth_email)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                )
                ErrorText(error)
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = {
                        isLoading = true
                        error = null
                        scope.launch {
                            try {
                                authRepository.beginLogin(email)
                                authRepository.requestCode(email)
                                step = "code"
                            } catch (e: Exception) {
                                error = e.message ?: "Login failed"
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = email.isNotBlank() && !isLoading
                ) {
                    LoadingOrText(isLoading, stringResource(MochiR.string.auth_continue))
                }
            }
            "code" -> {
                Text(
                    text = stringResource(R.string.feeds_auth_email_code_sent, email),
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it; error = null },
                    label = { Text(stringResource(MochiR.string.auth_verification_code)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text)
                )
                ErrorText(error)
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = {
                        isLoading = true
                        error = null
                        scope.launch {
                            try {
                                when (val result = authRepository.verifyCode(code)) {
                                    is AuthResult.Success -> onAuthComplete()
                                    is AuthResult.NeedsIdentity -> step = "identity"
                                    is AuthResult.NeedsMfa -> {
                                        error = "MFA not yet supported in mobile app"
                                    }
                                }
                            } catch (e: Exception) {
                                error = e.message ?: "Verification failed"
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = code.isNotBlank() && !isLoading
                ) {
                    LoadingOrText(isLoading, stringResource(MochiR.string.auth_verify))
                }
            }
            "identity" -> {
                Text(
                    text = stringResource(MochiR.string.auth_create_identity_title),
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = identityName,
                    onValueChange = { identityName = it; error = null },
                    label = { Text(stringResource(MochiR.string.auth_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                ErrorText(error)
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = {
                        isLoading = true
                        error = null
                        scope.launch {
                            try {
                                authRepository.createIdentity(identityName)
                                onAuthComplete()
                            } catch (e: Exception) {
                                error = e.message ?: "Failed to create identity"
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = identityName.isNotBlank() && !isLoading
                ) {
                    LoadingOrText(isLoading, stringResource(MochiR.string.auth_create))
                }
            }
        }

    }
}

@Composable
private fun ErrorText(error: String?) {
    if (error != null) {
        Text(
            text = error,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

@Composable
private fun LoadingOrText(isLoading: Boolean, text: String) {
    if (isLoading) {
        CircularProgressIndicator(
            modifier = Modifier.size(20.dp),
            strokeWidth = 2.dp,
            color = MaterialTheme.colorScheme.onPrimary
        )
    } else {
        Text(text)
    }
}
