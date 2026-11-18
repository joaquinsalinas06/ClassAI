package com.classai.mobile

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.ZoneId

class StudentAppTest {
    @Test fun errorMessages() {
        assertTrue(failureFor(Op.REGISTER, 409) is Failure.AccountExists)
        assertTrue(failureFor(Op.REGISTER, 409).message.contains("Inicia sesión"))
        assertEquals("Código o contraseña incorrectos.", failureFor(Op.LOGIN, 401).message)
        assertTrue(failureFor(Op.DATA, 401) is Failure.SessionExpired)   // vuelve al login
        assertTrue(failureFor(Op.VOTE, 401) is Failure.SessionExpired)
        assertTrue(failureFor(Op.VOTE, 409).message.contains("terminó"))
        assertTrue(failureFor(Op.LOGIN, null).message.startsWith("Sin conexión"))
        assertTrue(failureFor(Op.DATA, 503).message.contains("servidor"))
    }

    @Test fun parseAuthResponse() {
        val a = parseAuth(JSONObject("""{"access_token":"tok","token_type":"bearer","expires_at":"x",
            "student":{"code":"202310123","full_name":"Valeria Quispe","phone_linked":true}}"""))
        assertEquals("tok", a.token)
        assertEquals(Student("202310123", "Valeria Quispe"), a.student)
    }

    @Test fun parseClassWithAndWithoutMetrics() {
        val c = parseClass(JSONObject("""{"id":"a101-1","room":"a101","course":"IoT","started_at":"2026-11-18T14:00:00Z",
            "ended":false,"attended":true,"attended_at":"2026-11-18T14:02:00Z","my_vote":"hot",
            "metrics":{"temp_c":24.1,"rh_pct":55,"noise_rel":0.2,"comfort":82,"state":"OK","presence":true}}"""))
        assertTrue(c.attended); assertEquals("hot", c.myVote)
        assertEquals(24.1, c.metrics!!.tempC!!, 0.001); assertEquals(true, c.metrics!!.presence)
        val n = parseClass(JSONObject("""{"id":"a101-1","ended":false,"attended":false,"attended_at":null,"my_vote":null,"metrics":{}}"""))
        assertNull(n.metrics); assertNull(n.myVote); assertNull(n.attendedAt)
    }

    @Test fun validation() {
        assertNull(validateCode("202310123")); assertNull(validateCode("u-2023"))
        assertNotNull(validateCode("")); assertNotNull(validateCode("a b"))
        assertNull(validatePassword("secreta")); assertNotNull(validatePassword("12345"))
        assertNotNull(validateName(" a "))
    }

    @Test fun nfcStatusPriority() {
        assertEquals(CardStatus.ACTIVE, cardStatus(hasNfc = true, hce = true, nfcOn = true))
        assertEquals(CardStatus.NFC_OFF, cardStatus(true, true, false))
        assertEquals(CardStatus.NO_HCE, cardStatus(true, false, true))
        assertEquals(CardStatus.NO_NFC, cardStatus(false, false, false))
    }

    @Test fun labels() {
        assertEquals("AP", initials("Ana María Pérez")); assertEquals("A", initials("ana"))
        assertEquals("Confortable", comfortLabel("OK")); assertEquals("Incómodo", comfortLabel("ALERT"))
        assertEquals("Bajo", noiseLabel(0.1)); assertEquals("Alto", noiseLabel(0.9)); assertEquals("—", noiseLabel(null))
        assertEquals("09:02", timeLabel("2026-11-18T14:02:00Z", ZoneId.of("America/Lima")))
        assertNull(timeLabel(null))
        assertEquals("24.1 °C", fmt1(24.14, "°C"))
    }

    @Test fun roomExtras() {
        val c = parseClass(JSONObject("""{"id":"a","room":"a101","started_at":"2026-11-18T14:00:00Z","ended":false,"attended":true,
            "metrics":{"temp_c":25.2,"zones":{"entrance":true,"interior":false},"fan_on":true},"present_count":12,
            "targets":{"temp_c":[21,24],"rh_pct":[40,60],"noise_rel_max":0.1},
            "trend":[{"minute":"m1","comfort":80,"temp_c":24.0},{"minute":"m2","comfort":84,"temp_c":24.3}]}"""))
        assertEquals(12, c.presentCount); assertEquals(true, c.metrics!!.entrance); assertEquals(false, c.metrics!!.interior)
        assertEquals(Mood.HOT, roomMood(c.metrics, c.targets)); assertEquals(Mood.OK, roomMood(null, null))
        assertEquals(0.3, trendDelta(c.trend.map { it.tempC })!!, 0.001); assertNull(trendDelta(listOf(1.0)))
        assertEquals(1f, noiseLevel(0.9)); assertEquals(0f, noiseLevel(null))
        assertEquals("hace 1 h 5 min", elapsedLabel("2026-11-18T14:00:00Z", java.time.Instant.parse("2026-11-18T15:05:00Z")))
        assertEquals("+0,3 °C", signed1(0.3, " °C"))
        assertEquals(1, parseHistory(JSONObject("""{"history":[{"session_id":"a","course":"IoT","attended_at":"x"}]}""")).size)
    }
}
