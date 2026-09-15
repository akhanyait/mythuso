package za.co.mythuso

import java.io.File
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import za.co.mythuso.model.QrCode

/* Android's QR encoder, held module for module to the codes the web encoder draws in tests/fixtures/qr-vectors.txt,
 * each of which the macOS Vision framework read back exactly before the file was written. A disagreement here is
 * this port's arithmetic, and a code that differs by one module from one an independent decoder read is a code
 * nobody has shown scans.
 *
 * A JVM test, deliberately: the encoder is plain Kotlin, and whether it draws the right code should not wait for
 * an emulator. The working directory of a Gradle unit test is the module, apps/android/app. */
class QrCodeTest {
    private data class Vector(val text: String, val version: Int, val mask: Int, val rows: List<String>)

    private fun vectors(): List<Vector> {
        val file = listOf("../../../tests/fixtures/qr-vectors.txt", "../../tests/fixtures/qr-vectors.txt").map(::File).firstOrNull { it.exists() }
            ?: error("tests/fixtures/qr-vectors.txt is not where this test looks for it, from ${File(".").absolutePath}.")
        val out = mutableListOf<Vector>()
        var text = ""; var version = 0; var mask = 0; val rows = mutableListOf<String>()
        for (line in file.readLines().filter { it.isNotBlank() && !it.startsWith("#") }) {
            when {
                line.startsWith("text ") -> { text = String(Base64.getDecoder().decode(line.removePrefix("text ")), Charsets.UTF_8); rows.clear() }
                line.startsWith("version ") -> { val parts = line.split(" "); version = parts[1].toInt(); mask = parts[3].toInt() }
                line == "end" -> out.add(Vector(text, version, mask, rows.toList()))
                else -> rows.add(line)
            }
        }
        return out
    }

    @Test fun drawsTheCodesTheWebDrewAndVisionReadBack() {
        val all = vectors()
        assertTrue("tests/fixtures/qr-vectors.txt holds no vectors, so this test proves nothing", all.size >= 5)
        val disagreements = all.mapNotNull { vector ->
            val code = QrCode.encode(vector.text)
            if (code.version == vector.version && code.mask == vector.mask && code.rows() == vector.rows) null
            else "\"${vector.text.take(40)}\" drew version ${code.version} mask ${code.mask}; the vector is version ${vector.version} mask ${vector.mask}"
        }
        assertEquals(emptyList<String>(), disagreements)
    }

    @Test(expected = IllegalArgumentException::class) fun refusesATextLongerThanItHasShownItCanDraw() {
        QrCode.encode("z".repeat(QrCode.capacityBytes(QrCode.MAX_VERSION) + 1))
    }
}
