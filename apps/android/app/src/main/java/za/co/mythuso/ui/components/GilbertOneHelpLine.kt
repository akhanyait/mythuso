package za.co.mythuso.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import za.co.mythuso.R
import za.co.mythuso.model.GilbertOneHelper
import za.co.mythuso.ui.ThusoRadius
import za.co.mythuso.ui.ThusoSpacing
import za.co.mythuso.ui.theme

/* The v3 pack's helper line (29 October 2026): GilbertOne beside one sentence from
 * packages/catalog/gilbertone-states.json, generated into GilbertOneStatesData, so no screen types a word for it.
 *
 * GilbertOne is drawn in its still idle pose, a vector of the web's own paths, and is decoration: TalkBack reads
 * the sentence, once, as one node. The web's six moving poses are not drawn here yet, so a phone never shows a
 * found or success pose it cannot animate the way the web does; the state stays a name in the data. */
@Composable fun GilbertOneHelpLine(line: GilbertOneHelper, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().background(theme.surface, RoundedCornerShape(ThusoRadius.lg))
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space8)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(painterResource(R.drawable.gilbertone_idle), contentDescription = null, modifier = Modifier.size(46.dp))
        Text(line.text, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
    }
}
