package com.classai.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EnrollmentTest {
    @Test fun outcomes() {
        assertEquals(EnrollOutcome.Linked, enrollOutcome(200))
        assertEquals(EnrollOutcome.Linked, enrollOutcome(201))
        val conflict = enrollOutcome(409)
        assertTrue(conflict is EnrollOutcome.Rejected)
        assertEquals("Este estudiante ya tiene un teléfono activo, pide al docente que lo revoque",
            (conflict as EnrollOutcome.Rejected).message)
        assertTrue(enrollOutcome(422) is EnrollOutcome.Rejected)
        assertEquals(EnrollOutcome.Pending, enrollOutcome(null))  // sin red
        assertEquals(EnrollOutcome.Pending, enrollOutcome(500))   // servidor caído
        assertEquals(EnrollOutcome.Pending, enrollOutcome(503))
    }

    @Test fun statusPriority() {
        assertEquals(CardStatus.ACTIVE, cardStatus(hasNfc = true, hce = true, nfcOn = true, enrolled = true))
        assertEquals(CardStatus.PENDING, cardStatus(hasNfc = true, hce = true, nfcOn = true, enrolled = false))
        assertEquals(CardStatus.NFC_OFF, cardStatus(hasNfc = true, hce = true, nfcOn = false, enrolled = false))
        assertEquals(CardStatus.NO_HCE, cardStatus(hasNfc = true, hce = false, nfcOn = true, enrolled = true))
        assertEquals(CardStatus.NO_NFC, cardStatus(hasNfc = false, hce = false, nfcOn = false, enrolled = true))
        assertEquals("Activa", CardStatus.ACTIVE.label)
        assertEquals("Pendiente de vincular", CardStatus.PENDING.label)
    }

    @Test fun validation() {
        assertNull(validateCode("202310123"))
        assertNull(validateCode(" 202310123 "))
        assertTrue(validateCode("20231a") != null)
        assertTrue(validateCode("") != null)
        assertNull(validateName("Ana Pérez"))
        assertTrue(validateName("  A ") != null)
    }

    @Test fun server() {
        assertEquals("http://10.0.2.2:8000", normalizeServer(" http://10.0.2.2:8000/ "))
        assertEquals("https://classai.example/api", normalizeServer("https://classai.example/api"))
        assertNull(normalizeServer("10.0.2.2:8000"))
        assertNull(normalizeServer("ftp://x"))
        assertNull(normalizeServer("http://"))
    }

    @Test fun json() {
        assertEquals(
            """{"student_code":"202310123","full_name":"Ana \"Ani\" Pérez","token":"00FF"}""",
            enrollJson(" 202310123", "Ana \"Ani\" Pérez ", "00FF"),
        )
        assertEquals("\"a\\\\b\\u000a\"", jsonString("a\\b\n"))
    }

    @Test fun avatarInitials() {
        assertEquals("AP", initials("Ana María Pérez"))
        assertEquals("J", initials("  joaquín "))
        assertEquals("ÁÑ", initials("álvaro  ñuñez"))
        assertEquals("", initials(""))
    }
}
