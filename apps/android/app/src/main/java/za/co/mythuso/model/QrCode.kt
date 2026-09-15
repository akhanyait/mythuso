package za.co.mythuso.model

import kotlin.math.abs
import kotlin.math.ceil

/* A QR code, drawn from the standard rather than from a library.
 *
 * WHY THIS IS HERE AND NOT A DEPENDENCY. packages/catalog/open-source.json and the Master document's §15D
 * procurement rules forbid adopting a component before its licence, security, maintenance and data-flow reviews
 * exist, and none exists for a QR library. Android has no QR generator of its own, as iOS has in CoreImage. So
 * this is apps/web/src/lib/qr.ts ported line for line: byte mode, error correction level M, versions 1 to 10.
 *
 * HOW IT IS KNOWN TO WORK. tests/fixtures/qr-vectors.txt holds the modules the web encoder draws for a handful of
 * texts, each read back exactly by the macOS Vision framework's barcode detector on the day they were written.
 * app/src/test/java/za/co/mythuso/QrCodeTest.kt holds this file to the same vectors, module for module, so
 * a phone draws exactly the code the web draws and an independent decoder read.
 *
 * It refuses a text longer than version 10 holds rather than drawing a denser code nobody has read back. It is
 * not a scanner, and the card it draws opens nothing. */
class QrCode private constructor(val version: Int, val mask: Int, val size: Int, private val dark: Array<BooleanArray>) {
    fun isDark(x: Int, y: Int): Boolean = dark[y][x]
    fun rows(): List<String> = dark.map { row -> row.joinToString("") { if (it) "1" else "0" } }

    companion object {
        const val MAX_VERSION = 10
        const val QUIET_ZONE = 4
        private val ECC_PER_BLOCK = intArrayOf(-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26)
        private val BLOCKS = intArrayOf(-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5)
        private const val LEVEL_M = 0

        private fun rawModules(version: Int): Int {
            var result = (16 * version + 128) * version + 64
            if (version >= 2) {
                val align = version / 7 + 2
                result -= (25 * align - 10) * align - 55
                if (version >= 7) result -= 36
            }
            return result
        }
        private fun dataCodewords(version: Int) = rawModules(version) / 8 - ECC_PER_BLOCK[version] * BLOCKS[version]
        fun capacityBytes(version: Int) = (dataCodewords(version) * 8 - 4 - (if (version < 10) 8 else 16)) / 8

        private fun multiply(x: Int, y: Int): Int {
            var z = 0
            for (i in 7 downTo 0) {
                z = (z shl 1) xor ((z ushr 7) * 0x11d)
                z = z xor (((y ushr i) and 1) * x)
            }
            return z
        }
        private fun divisor(degree: Int): IntArray {
            val result = IntArray(degree)
            result[degree - 1] = 1
            var root = 1
            for (i in 0 until degree) {
                for (j in 0 until degree) {
                    result[j] = multiply(result[j], root)
                    if (j + 1 < degree) result[j] = result[j] xor result[j + 1]
                }
                root = multiply(root, 0x02)
            }
            return result
        }
        private fun remainder(data: List<Int>, by: IntArray): List<Int> {
            val result = ArrayDeque(List(by.size) { 0 })
            for (byte in data) {
                val factor = byte xor result.removeFirst()
                result.addLast(0)
                for (i in by.indices) result[i] = result[i] xor multiply(by[i], factor)
            }
            return result.toList()
        }
        private fun alignmentPositions(version: Int, size: Int): List<Int> {
            if (version == 1) return emptyList()
            val count = version / 7 + 2
            val step = ceil((version * 4 + 4).toDouble() / (count * 2 - 2)).toInt() * 2
            val result = mutableListOf(6)
            var position = size - 7
            while (result.size < count) { result.add(1, position); position -= step }
            return result
        }
        private fun masked(mask: Int, x: Int, y: Int): Boolean = when (mask) {
            0 -> (x + y) % 2 == 0
            1 -> y % 2 == 0
            2 -> x % 3 == 0
            3 -> (x + y) % 3 == 0
            4 -> (x / 3 + y / 2) % 2 == 0
            5 -> (x * y) % 2 + (x * y) % 3 == 0
            6 -> ((x * y) % 2 + (x * y) % 3) % 2 == 0
            else -> ((x + y) % 2 + (x * y) % 3) % 2 == 0
        }

        fun encode(text: String): QrCode {
            val bytes = text.toByteArray(Charsets.UTF_8).map { it.toInt() and 0xff }
            var version = 1
            while (version <= MAX_VERSION && bytes.size > capacityBytes(version)) version++
            require(version <= MAX_VERSION) { "A QR code this encoder draws holds ${capacityBytes(MAX_VERSION)} bytes at most, and this text is ${bytes.size}." }

            val capacity = dataCodewords(version) * 8
            val bits = mutableListOf<Int>()
            fun push(value: Int, length: Int) { for (i in length - 1 downTo 0) bits.add((value ushr i) and 1) }
            push(0b0100, 4)
            push(bytes.size, if (version < 10) 8 else 16)
            bytes.forEach { push(it, 8) }
            push(0, minOf(4, capacity - bits.size))
            push(0, (8 - bits.size % 8) % 8)
            var pad = 0xec
            while (bits.size < capacity) { push(pad, 8); pad = pad xor (0xec xor 0x11) }
            val data = bits.chunked(8).map { chunk -> chunk.fold(0) { byte, bit -> (byte shl 1) or bit } }

            val blockCount = BLOCKS[version]
            val eccLength = ECC_PER_BLOCK[version]
            val raw = rawModules(version) / 8
            val shortBlocks = blockCount - raw % blockCount
            val shortLength = raw / blockCount
            val by = divisor(eccLength)
            val blocks = mutableListOf<List<Int>>()
            var k = 0
            for (i in 0 until blockCount) {
                val length = shortLength - eccLength + (if (i < shortBlocks) 0 else 1)
                val block = data.subList(k, k + length).toMutableList()
                k += length
                val ecc = remainder(block, by)
                if (i < shortBlocks) block.add(0)
                blocks.add(block + ecc)
            }
            val codewords = mutableListOf<Int>()
            for (i in blocks[0].indices) for (j in blocks.indices) if (i != shortLength - eccLength || j >= shortBlocks) codewords.add(blocks[j][i])

            val size = version * 4 + 17
            val modules = Array(size) { BooleanArray(size) }
            val fixed = Array(size) { BooleanArray(size) }
            fun set(x: Int, y: Int, value: Boolean) { modules[y][x] = value; fixed[y][x] = true }
            for (i in 0 until size) { set(6, i, i % 2 == 0); set(i, 6, i % 2 == 0) }
            fun finder(cx: Int, cy: Int) {
                for (dy in -4..4) for (dx in -4..4) {
                    val x = cx + dx; val y = cy + dy
                    if (x < 0 || x >= size || y < 0 || y >= size) continue
                    val distance = maxOf(abs(dx), abs(dy))
                    set(x, y, distance != 2 && distance != 4)
                }
            }
            finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
            val positions = alignmentPositions(version, size)
            val last = positions.size - 1
            for (i in positions.indices) for (j in positions.indices) {
                if ((i == 0 && j == 0) || (i == 0 && j == last) || (i == last && j == 0)) continue
                for (dy in -2..2) for (dx in -2..2) set(positions[i] + dx, positions[j] + dy, maxOf(abs(dx), abs(dy)) != 1)
            }
            fun drawFormat(mask: Int) {
                val value = (LEVEL_M shl 3) or mask
                var rem = value
                repeat(10) { rem = (rem shl 1) xor ((rem ushr 9) * 0x537) }
                val format = ((value shl 10) or rem) xor 0x5412
                fun bit(i: Int) = ((format ushr i) and 1) != 0
                for (i in 0..5) set(8, i, bit(i))
                set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
                for (i in 9 until 15) set(14 - i, 8, bit(i))
                for (i in 0 until 8) set(size - 1 - i, 8, bit(i))
                for (i in 8 until 15) set(8, size - 15 + i, bit(i))
                set(8, size - 8, true)
            }
            drawFormat(0)
            if (version >= 7) {
                var rem = version
                repeat(12) { rem = (rem shl 1) xor ((rem ushr 11) * 0x1f25) }
                val versionBits = (version shl 12) or rem
                for (i in 0 until 18) {
                    val value = ((versionBits ushr i) and 1) != 0
                    val a = size - 11 + i % 3; val b = i / 3
                    set(a, b, value); set(b, a, value)
                }
            }

            var bit = 0
            var right = size - 1
            while (right >= 1) {
                if (right == 6) right = 5
                for (vertical in 0 until size) for (j in 0 until 2) {
                    val x = right - j
                    val upward = ((right + 1) and 2) == 0
                    val y = if (upward) size - 1 - vertical else vertical
                    if (!fixed[y][x] && bit < codewords.size * 8) {
                        modules[y][x] = ((codewords[bit ushr 3] ushr (7 - (bit and 7))) and 1) != 0
                        bit++
                    }
                }
                right -= 2
            }

            fun applyMask(mask: Int) {
                for (y in 0 until size) for (x in 0 until size) if (!fixed[y][x] && masked(mask, x, y)) modules[y][x] = !modules[y][x]
            }
            fun penalty(): Int {
                var score = 0
                fun addHistory(runLength: Int, history: IntArray) {
                    var run = runLength
                    if (history[0] == 0) run += size
                    for (i in history.size - 1 downTo 1) history[i] = history[i - 1]
                    history[0] = run
                }
                fun countPatterns(history: IntArray): Int {
                    val n = history[1]
                    val core = n > 0 && history[2] == n && history[3] == n * 3 && history[4] == n && history[5] == n
                    return (if (core && history[0] >= n * 4 && history[6] >= n) 1 else 0) + (if (core && history[6] >= n * 4 && history[0] >= n) 1 else 0)
                }
                fun terminate(colour: Boolean, runLength: Int, history: IntArray): Int {
                    var run = runLength
                    if (colour) { addHistory(run, history); run = 0 }
                    addHistory(run + size, history)
                    return countPatterns(history)
                }
                fun line(at: (Int) -> Boolean) {
                    var colour = false
                    var run = 0
                    val history = IntArray(7)
                    for (i in 0 until size) {
                        if (at(i) == colour) {
                            run++
                            if (run == 5) score += 3 else if (run > 5) score++
                        } else {
                            addHistory(run, history)
                            if (!colour) score += countPatterns(history) * 40
                            colour = at(i)
                            run = 1
                        }
                    }
                    score += terminate(colour, run, history) * 40
                }
                for (y in 0 until size) line { x -> modules[y][x] }
                for (x in 0 until size) line { y -> modules[y][x] }
                for (y in 0 until size - 1) for (x in 0 until size - 1) {
                    val colour = modules[y][x]
                    if (colour == modules[y][x + 1] && colour == modules[y + 1][x] && colour == modules[y + 1][x + 1]) score += 3
                }
                val darkCount = modules.sumOf { row -> row.count { it } }
                val total = size * size
                score += (ceil(abs(darkCount * 20 - total * 10).toDouble() / total).toInt() - 1) * 10
                return score
            }
            var best = 0
            var bestScore = Int.MAX_VALUE
            for (mask in 0 until 8) {
                applyMask(mask)
                drawFormat(mask)
                val score = penalty()
                if (score < bestScore) { best = mask; bestScore = score }
                applyMask(mask)
            }
            applyMask(best)
            drawFormat(best)
            return QrCode(version, best, size, modules)
        }
    }
}
