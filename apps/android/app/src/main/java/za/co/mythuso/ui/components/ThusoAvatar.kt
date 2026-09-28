package za.co.mythuso.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import za.co.mythuso.ui.theme
import za.co.mythuso.ui.tint

/* A person's or an organisation's identity (apps/web/src/ui/Avatar.tsx). Never a decorative image, and
   never a button on its own — a control that opens a profile wraps it in one. The fallback's initials
   are the primary ink on a primary tint on a light ground and the handoff's dark accent on a dark one,
   because its dark primary as text on a tint does not clear 4.5:1. The name is what TalkBack reads. */
enum class ThusoAvatarSize(val dp: Dp) { Sm(32.dp), Md(40.dp), Lg(48.dp) }

@Composable fun ThusoAvatar(
    name: String,
    modifier: Modifier = Modifier,
    size: ThusoAvatarSize = ThusoAvatarSize.Md,
    image: Painter? = null,
    initials: String = name.split(' ').filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }
) {
    Box(
        modifier.size(size.dp).clip(CircleShape).background(theme.muted, CircleShape).semantics { contentDescription = name },
        Alignment.Center
    ) {
        if (image != null) Image(image, null, Modifier.size(size.dp), contentScale = ContentScale.Crop)
        else Box(Modifier.size(size.dp).background(theme.primary.tint(0.10f), CircleShape), Alignment.Center) {
            Text(initials, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = theme.primaryInk)
        }
    }
}
