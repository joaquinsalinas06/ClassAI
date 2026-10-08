package com.classai.mobile

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.Typeface
import android.os.Build
import android.os.SystemClock
import android.util.AttributeSet
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

// Efectos visuales en Canvas, sin librerías. Todos se quedan quietos si el sistema
// desactiva animaciones (escala de animación 0 / "quitar animaciones").

val motionEnabled: Boolean get() = ValueAnimator.areAnimatorsEnabled()

private fun View.dp(v: Float) = v * resources.displayMetrics.density

private fun View.now() = SystemClock.uptimeMillis()

/** Fondo del login: manchas de color difuminadas que derivan lentamente. */
class DriftBackgroundView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val colors = intArrayOf(
        context.getColor(R.color.blob_1), context.getColor(R.color.blob_2),
        context.getColor(R.color.blob_3), context.getColor(R.color.blob_1),
    )
    private val paints = colors.map { Paint(Paint.ANTI_ALIAS_FLAG) }
    private var radius = 0f
    private val t0 = now()

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        radius = max(w, h) * 0.5f
        paints.forEachIndexed { i, p ->
            val c = colors[i]
            p.shader = RadialGradient(0f, 0f, radius, Color.argb(150, Color.red(c), Color.green(c), Color.blue(c)),
                Color.TRANSPARENT, Shader.TileMode.CLAMP)
        }
    }

    override fun onDraw(canvas: Canvas) {
        val t = if (motionEnabled) (now() - t0) / 1000f else 0f
        paints.forEachIndexed { i, p ->
            val speed = 0.11f + i * 0.04f
            val cx = width * (0.5f + 0.42f * sin(t * speed + i * 1.7f))
            val cy = height * (0.15f + i * 0.25f + 0.1f * cos(t * speed * 0.8f + i))
            canvas.save()
            canvas.translate(cx, cy)
            canvas.drawCircle(0f, 0f, radius, p)
            canvas.restore()
        }
        if (motionEnabled && isShown) postInvalidateOnAnimation()
    }
}

/** Carnet digital: degradado de marca, brillo holográfico periódico y destello al leer. */
class IdCardView(context: Context, attrs: AttributeSet? = null) : FrameLayout(context, attrs) {
    private val radius = dp(24f)
    private val bg = Paint(Paint.ANTI_ALIAS_FLAG)
    private val deco = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x14FFFFFF }
    private val decoLine = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(1.5f); color = 0x1AFFFFFF
    }
    private val sheenPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = dp(4f) }
    private val sheenMatrix = Matrix()
    private val rect = RectF()
    private var sweepStart = 0L

    /** Posición del brillo estático según la inclinación (-1..1). */
    var holo = 0f
        set(v) { field = v; invalidate() }

    /** 0..1: borde luminoso del "tap" exitoso. */
    var glow = 0f
        set(v) { field = v; invalidate() }

    init {
        setWillNotDraw(false)
        outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) =
                outline.setRoundRect(0, 0, view.width, view.height, radius)
        }
        clipToOutline = true
        elevation = dp(10f)
        if (Build.VERSION.SDK_INT >= 28) {
            outlineSpotShadowColor = context.getColor(R.color.brand_violet)
            outlineAmbientShadowColor = context.getColor(R.color.brand_indigo)
        }
    }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        bg.shader = LinearGradient(0f, 0f, w.toFloat(), h.toFloat(),
            intArrayOf(context.getColor(R.color.brand_indigo), context.getColor(R.color.brand_violet),
                context.getColor(R.color.brand_teal)),
            floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
        // banda diagonal iridiscente (blanco → cian → rosa)
        val band = w * 0.45f
        sheenPaint.shader = LinearGradient(0f, 0f, band, band * 0.5f,
            intArrayOf(0x00FFFFFF, 0x38FFFFFF, 0x3067E8F9, 0x30F472B6, 0x00FFFFFF),
            floatArrayOf(0f, 0.35f, 0.55f, 0.75f, 1f), Shader.TileMode.CLAMP)
        glowPaint.shader = LinearGradient(0f, 0f, w.toFloat(), h.toFloat(),
            context.getColor(R.color.brand_teal_light), context.getColor(R.color.brand_yellow), Shader.TileMode.CLAMP)
    }

    /** Lanza un barrido del brillo ahora. */
    fun sweepOnce() {
        sweepStart = now()
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        rect.set(0f, 0f, w, h)
        canvas.drawRect(rect, bg)
        canvas.drawCircle(w * 0.88f, -h * 0.05f, h * 0.75f, deco)
        canvas.drawCircle(w * 0.05f, h * 1.15f, h * 0.6f, deco)
        for (i in 1..3) canvas.drawCircle(w * 0.88f, -h * 0.05f, h * (0.75f + i * 0.14f), decoLine)
    }

    override fun dispatchDraw(canvas: Canvas) {
        super.dispatchDraw(canvas)
        val w = width.toFloat()
        // barrido periódico cada ~6 s; entre barridos, brillo tenue según inclinación
        val period = 6000L
        val t = now()
        val sinceSweep = t - sweepStart
        val p = if (motionEnabled) {
            if (sinceSweep in 0..1400) sinceSweep / 1400f else ((t % period) / 1400f).takeIf { it <= 1f }
        } else null
        if (p != null) {
            sheenPaint.alpha = 255
            sheenMatrix.setTranslate(-w * 0.5f + p * w * 1.6f, 0f)
        } else {
            sheenPaint.alpha = (60 + 120 * abs(holo)).toInt()
            sheenMatrix.setTranslate(w * (0.25f + 0.35f * holo), 0f)
        }
        sheenPaint.shader.setLocalMatrix(sheenMatrix)
        canvas.drawRect(0f, 0f, w, height.toFloat(), sheenPaint)
        if (glow > 0f) {
            glowPaint.alpha = (255 * glow).toInt()
            val inset = glowPaint.strokeWidth / 2
            rect.set(inset, inset, w - inset, height - inset)
            canvas.drawRoundRect(rect, radius, radius, glowPaint)
        }
        // solo 60 fps durante el barrido; si no, despertar para el siguiente
        if (motionEnabled && isShown) {
            if (p != null) postInvalidateOnAnimation() else postInvalidateDelayed(period - t % period)
        }
    }
}

/** Ondas NFC: anillos que se expanden mientras el carnet está listo para el lector. */
class WavesView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = dp(2f); color = Color.WHITE }
    private val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x26FFFFFF }
    private val t0 = now()

    var active = false
        set(v) { field = v; invalidate() }

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width - dp(38f)  // centro del ícono NFC: padding del carnet 20dp + 18dp
        val cy = height - dp(38f)
        val rMin = dp(22f)
        val rMax = min(width, height) * 0.62f
        canvas.drawCircle(cx, cy, rMin, halo)
        if (!active) return
        if (!motionEnabled) {
            ring.alpha = 110
            canvas.drawCircle(cx, cy, (rMin + rMax) / 2, ring)
            return
        }
        val t = (now() - t0) / 1800f
        for (i in 0 until 3) {
            val f = (t + i / 3f) % 1f
            ring.alpha = (180 * (1 - f)).toInt()
            canvas.drawCircle(cx, cy, rMin + f * (rMax - rMin), ring)
        }
        if (isShown) postInvalidateOnAnimation()
    }
}

/** Capa de celebración: ondas que estallan desde un punto y confeti con física simple. */
class CelebrationView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private class Bit(
        val vx: Float, val vy: Float, val rot0: Float, val vrot: Float,
        val wobble: Float, val color: Int, val size: Float, val round: Boolean,
    )

    private val palette = intArrayOf(0xFFFBBF24.toInt(), 0xFFF472B6.toInt(), 0xFF2DD4BF.toInt(),
        0xFFA5B4FC.toInt(), 0xFFFFFFFF.toInt(), 0xFFA78BFA.toInt(), 0xFF34D399.toInt())
    private val bits = ArrayList<Bit>()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private var ox = 0f
    private var oy = 0f
    private var t0 = -1L

    init {
        isClickable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun play(x: Float, y: Float) {
        ox = x; oy = y
        bits.clear()
        repeat(150) {
            val angle = -PI / 2 + (Random.nextDouble() - 0.5) * PI * 1.25  // abanico hacia arriba
            val speed = dp(420f + Random.nextFloat() * 900f)
            bits += Bit(
                vx = (cos(angle) * speed).toFloat(), vy = (sin(angle) * speed).toFloat(),
                rot0 = Random.nextFloat() * 360f, vrot = (Random.nextFloat() - 0.5f) * 720f,
                wobble = 4f + Random.nextFloat() * 8f, color = palette[Random.nextInt(palette.size)],
                size = dp(6f + Random.nextFloat() * 6f), round = Random.nextInt(4) == 0,
            )
        }
        t0 = now()
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        if (t0 < 0) return
        val t = (now() - t0) / 1000f
        if (t > 3f) { t0 = -1; return }
        // 3 ondas expansivas desde el ícono NFC
        for (k in 0 until 3) {
            val tk = t - k * 0.14f
            if (tk !in 0f..0.9f) continue
            val f = tk / 0.9f
            ringPaint.strokeWidth = dp(6f * (1 - f) + 1f)
            ringPaint.color = if (k == 1) 0xFFFBBF24.toInt() else 0xFF2DD4BF.toInt()
            ringPaint.alpha = (230 * (1 - f)).toInt()
            canvas.drawCircle(ox, oy, dp(24f) + f * dp(260f), ringPaint)
        }
        // confeti: arrastre lineal + gravedad (forma cerrada, sin integrar)
        val k = 1.3f
        val g = dp(700f)
        val decay = (1 - exp(-k * t)) / k
        val fade = if (t > 2.2f) 1 - (t - 2.2f) / 0.8f else 1f
        for (b in bits) {
            val x = ox + b.vx * decay
            val y = oy + g / k * t + (b.vy - g / k) * decay
            paint.color = b.color
            paint.alpha = (255 * fade).toInt().coerceIn(0, 255)
            canvas.save()
            canvas.translate(x, y)
            canvas.rotate(b.rot0 + b.vrot * t)
            if (b.round) canvas.drawCircle(0f, 0f, b.size / 2.6f, paint)
            else {
                val sw = b.size * abs(cos(t * b.wobble))  // aleteo
                canvas.drawRect(-sw / 2, -b.size / 4, sw / 2, b.size / 4, paint)
            }
            canvas.restore()
        }
        postInvalidateOnAnimation()
    }
}

/** Avatar con iniciales y anillo degradado. */
class AvatarView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = dp(3f) }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x33FFFFFF }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE; textAlign = Paint.Align.CENTER; typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
    }

    var initials = ""
        set(v) { field = v; invalidate() }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        ring.shader = SweepGradient(w / 2f, h / 2f,
            intArrayOf(0xFF2DD4BF.toInt(), 0xFFFBBF24.toInt(), 0xFFF472B6.toInt(), 0xFFA78BFA.toInt(), 0xFF2DD4BF.toInt()), null)
        text.textSize = h * 0.36f
    }

    override fun onDraw(canvas: Canvas) {
        val r = min(width, height) / 2f
        canvas.drawCircle(width / 2f, height / 2f, r - ring.strokeWidth * 1.8f, fill)
        canvas.drawCircle(width / 2f, height / 2f, r - ring.strokeWidth / 2, ring)
        canvas.drawText(initials, width / 2f, height / 2f - (text.ascent() + text.descent()) / 2, text)
    }
}
