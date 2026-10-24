package com.classai.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EnrollmentTest {
    @Test fun outcomes() {
        assertEquals(EnrollOutcome.Linked("Ana"), enrollOutcome(200, "Ana"))
        assertEquals(EnrollOutcome.Linked("Ana"), enrollOutcome(201, " Ana "))
        assertEquals(EnrollOutcome.Pending, enrollOutcome(200))
        assertEquals(EnrollOutcome.Pending, enrollOutcome(200, " "))
        val conflict = enrollOutcome(409)
        assertTrue(conflict is EnrollOutcome.Rejected)
        assertEquals("Este estudiante ya tiene un teléfono activo, pide al docente que lo revoque",
            (conflict as EnrollOutcome.Rejected).message)
        assertTrue(enrollOutcome(422) is EnrollOutcome.Rejected)
        assertTrue((enrollOutcome(404) as EnrollOutcome.Rejected).message.contains("docente"))
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
        assertNull(validateCode("0012345"))
        assertTrue(validateCode("１２３４５") != null)
        assertTrue(validateCode("1234") != null)
        assertTrue(validateCode("1234567890123") != null)
        assertNull(validateCode(" 202310123 "))
        assertTrue(validateCode("20231a") != null)
        assertTrue(validateCode("") != null)
    }

    @Test fun json() {
        assertEquals(
            """{"student_code":"202310123","token":"00FF"}""",
            enrollJson(" 202310123", "00FF"),
        )
        assertEquals("\"a\\\\b\\u000a\"", jsonString("a\\b\n"))
    }

    @Test fun avatarInitials() {
        assertEquals("AP", initials("Ana María Pérez"))
        assertEquals("J", initials("  joaquín "))
        assertEquals("ÁÑ", initials("álvaro  ñuñez"))
        assertEquals("", initials(""))
    }
    @Test fun staleEnrollmentCannotActivateAnotherProfile() {
        val token = byteArrayOf(1, 2)
        assertTrue(enrollmentResultIsCurrent(2, 2, "a", "a", token, token.copyOf()))
        assertTrue(!enrollmentResultIsCurrent(1, 2, "a", "a", token, token))
        assertTrue(!enrollmentResultIsCurrent(2, 2, "a", "b", token, token))
        assertTrue(!enrollmentResultIsCurrent(2, 2, "a", "a", token, byteArrayOf(3)))
        assertTrue(!enrollmentResultIsCurrent(2, 2, "a", "a", token, null))
    }
}
