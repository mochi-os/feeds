package org.mochi.feeds.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.mochi.feeds.R
import org.mochi.android.R as MochiR

@Composable
fun AiTab(
    viewModel: FeedSettingsViewModel
) {
    val aiMode by viewModel.aiMode.collectAsState()
    val aiPrompts by viewModel.aiPrompts.collectAsState()
    val aiDefaults by viewModel.aiDefaults.collectAsState()

    val modes = listOf(
        "" to stringResource(R.string.feeds_ai_mode_off),
        "tag" to stringResource(R.string.feeds_ai_mode_tag),
        "tag+deduplicate" to stringResource(R.string.feeds_ai_mode_tag_deduplicate),
    )

    val promptTypes = listOf(
        "new" to stringResource(R.string.feeds_ai_prompt_new),
        "batch" to stringResource(R.string.feeds_ai_prompt_batch),
        "rank" to stringResource(R.string.feeds_ai_prompt_rank),
        "credibility" to stringResource(R.string.feeds_ai_prompt_credibility),
    )

    val descriptionOff = stringResource(R.string.feeds_ai_mode_off_description)
    val descriptionTag = stringResource(R.string.feeds_ai_mode_tag_description)
    val descriptionTagDeduplicate = stringResource(R.string.feeds_ai_mode_tag_deduplicate_description)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text(
            text = stringResource(R.string.feeds_ai_processing_mode),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))

        modes.forEach { (value, label) ->
            AiModeOption(
                label = label,
                description = when (value) {
                    "" -> descriptionOff
                    "tag" -> descriptionTag
                    "tag+deduplicate" -> descriptionTagDeduplicate
                    else -> ""
                },
                selected = aiMode == value,
                onClick = { viewModel.setAiMode(value) }
            )
        }

        Spacer(modifier = Modifier.height(24.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = stringResource(R.string.feeds_ai_custom_prompts),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.feeds_ai_custom_prompts_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))

        promptTypes.forEach { (type, label) ->
            PromptEditor(
                label = label,
                value = aiPrompts[type] ?: "",
                defaultValue = aiDefaults[type] ?: "",
                onValueChange = { viewModel.setAiPromptText(type, it) },
                onSave = { viewModel.saveAiPrompt(type) },
                onReset = { viewModel.resetAiPrompt(type) }
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun PromptEditor(
    label: String,
    value: String,
    defaultValue: String,
    onValueChange: (String) -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit
) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(4.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp),
            maxLines = 8
        )
        Spacer(modifier = Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onSave) {
                Text(stringResource(MochiR.string.common_save))
            }
            if (value != defaultValue) {
                TextButton(onClick = onReset) {
                    Text(stringResource(R.string.feeds_ai_reset_default))
                }
            }
        }
    }
}

@Composable
private fun AiModeOption(
    label: String,
    description: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = selected,
            onClick = onClick
        )
        Column(modifier = Modifier.padding(start = 8.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
