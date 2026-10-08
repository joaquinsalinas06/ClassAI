package com.classai.mobile

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class ApduHandlerTest {
    private val select = "00A4040008F0434C415353414900".hexToBytesOrNull()!!
    private val get = "80CA000011".hexToBytesOrNull()!!
    private val token = ByteArray(16) { (it * 17).toByte() }

    private fun sw(r: ByteArray) = r.takeLast(2).toByteArray().toHex()
    private fun selected() = ApduHandler().also { it.process(select, token) }

    @Test fun selectOk() = assertEquals("9000", ApduHandler().process(select, token).toHex())

    @Test fun selectWithoutLeOk() =
        assertEquals("9000", ApduHandler().process(select.copyOf(13), token).toHex())

    @Test fun selectOtherAid() =
        assertEquals("6A82", ApduHandler().process("00A4040007A0000002471001".hexToBytesOrNull()!!, token).toHex())

    @Test fun selectBadLc() =
        assertEquals("6700", ApduHandler().process("00A404000AF0434C415353414900".hexToBytesOrNull()!!, token).toHex())

    @Test fun getCredentialOk() {
        val r = selected().process(get, token)
        assertEquals(19, r.size)
        assertEquals(0x01.toByte(), r[0])
        assertArrayEquals(token, r.copyOfRange(1, 17))
        assertEquals("9000", sw(r))
    }

    @Test fun noToken() = assertEquals("6985", selected().process(get, null).toHex())

    @Test fun badToken() = assertEquals("6985", selected().process(get, ByteArray(8)).toHex())

    @Test fun getBeforeSelect() = assertEquals("6985", ApduHandler().process(get, token).toHex())

    @Test fun getAfterOtherAid() {
        val h = selected()
        h.process("00A4040007A0000002471001".hexToBytesOrNull()!!, token)
        assertEquals("6985", h.process(get, token).toHex())
    }

    @Test fun getAfterReset() = assertEquals("6985", selected().also { it.reset() }.process(get, token).toHex())

    @Test fun getBadLength() {
        assertEquals("6700", selected().process("80CA000010".hexToBytesOrNull()!!, token).toHex())
        assertEquals("6700", selected().process("80CA0000".hexToBytesOrNull()!!, token).toHex())
        assertEquals("6700", selected().process("80CA00001100".hexToBytesOrNull()!!, token).toHex())
    }

    @Test fun tooShort() = assertEquals("6700", ApduHandler().process(byteArrayOf(0x00, 0xA4.toByte()), token).toHex())

    @Test fun unknownIns() = assertEquals("6D00", selected().process("80B0000000".hexToBytesOrNull()!!, token).toHex())

    @Test fun hex() {
        assertEquals("00FF7F", byteArrayOf(0, -1, 0x7F).toHex())
        assertEquals(null, "0G".hexToBytesOrNull())
        assertEquals(null, "ABC".hexToBytesOrNull())
    }
}
