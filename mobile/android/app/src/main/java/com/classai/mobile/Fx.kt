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
import android.graphics.Typeface
import android.os.Build
import android.os.SystemClock
import android.util.AttributeSet
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import androidx.core.graphics.ColorUtils
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

// Efectos visuales en Canvas, sin librerías. Todos se quedan quietos si el sistema
// desactiva animaciones (escala de animación 0 / "quitar animaciones").

val motionEnabled: Boolean get() = ValueAnimator.areAnimatorsEnabled()

private fun View.dp(v: Float) = v * resources.displayMetrics.density

private fun View.now() = SystemClock.uptimeMillis()

/** Fondo del login: superficies neutras compartidas, con movimiento reducido. */
class DriftBackgroundView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val colors = intArrayOf(
        context.getColor(R.color.ds_bg_selected), context.getColor(R.color.ds_bg_sunken),
        context.getColor(R.color.ds_bg_hover), context.getColor(R.color.ds_bg_selected),
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

/** Carnet digital: tinta de marca, brillo monocromo y destello al leer. */
class IdCardView(context: Context, attrs: AttributeSet? = null) : FrameLayout(context, attrs) {
    private val radius = resources.getDimension(R.dimen.ds_radius_xl)
    private val bg = Paint(Paint.ANTI_ALIAS_FLAG)
    private val deco = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ColorUtils.setAlphaComponent(context.getColor(R.color.ds_brand_on_ink), 20) }
    private val decoLine = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(1.5f); color = ColorUtils.setAlphaComponent(context.getColor(R.color.ds_brand_on_ink), 26)
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
            outlineSpotShadowColor = context.getColor(R.color.ds_border_strong)
            outlineAmbientShadowColor = context.getColor(R.color.ds_border_strong)
        }
    }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        bg.color = context.getColor(R.color.ds_brand_ink)
        // Brillo derivado de on-ink: no introduce una paleta paralela.
        val band = w * 0.45f
        sheenPaint.shader = LinearGradient(0f, 0f, band, band * 0.5f,
            intArrayOf(0, 24, 20, 16, 0).map {
                ColorUtils.setAlphaComponent(context.getColor(R.color.ds_brand_on_ink), it)
            }.toIntArray(),
            floatArrayOf(0f, 0.35f, 0.55f, 0.75f, 1f), Shader.TileMode.CLAMP)
        glowPaint.shader = LinearGradient(0f, 0f, w.toFloat(), h.toFloat(),
            context.getColor(R.color.ds_state_ok_solid), context.getColor(R.color.ds_state_ok_border), Shader.TileMode.CLAMP)
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
        val period = 14000L
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
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = dp(2f); color = context.getColor(R.color.ds_brand_on_ink) }
    private val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ColorUtils.setAlphaComponent(context.getColor(R.color.ds_brand_on_ink), 38) }
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
        val t = (now() - t0) / 3000f
        val f = t % 1f
        ring.alpha = (90 * (1 - f)).toInt()
        canvas.drawCircle(cx, cy, rMin + f * (rMax - rMin), ring)
        if (isShown) postInvalidateDelayed(48)
    }
}

/** Avatar con iniciales y anillo en tinta. */
class AvatarView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(3f); color = context.getColor(R.color.ds_brand_on_ink)
    }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ColorUtils.setAlphaComponent(context.getColor(R.color.ds_brand_on_ink), 51) }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = context.getColor(R.color.ds_brand_on_ink); textAlign = Paint.Align.CENTER; typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
    }

    var initials = ""
        set(v) { field = v; invalidate() }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        text.textSize = h * 0.36f
    }

    override fun onDraw(canvas: Canvas) {
        val r = min(width, height) / 2f
        canvas.drawCircle(width / 2f, height / 2f, r - ring.strokeWidth * 1.8f, fill)
        canvas.drawCircle(width / 2f, height / 2f, r - ring.strokeWidth / 2, ring)
        canvas.drawText(initials, width / 2f, height / 2f - (text.ascent() + text.descent()) / 2, text)
    }
}

/** Teléfono y lector del aula; ondas y dos destellos discretos. */
class SignalView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val ink = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = context.getColor(R.color.ds_text_primary)
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = context.getColor(R.color.ds_text_secondary)
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        textSize = 10f
    }
    private val shape = RectF()
    private val star = android.graphics.Path()
    private val t0 = now()

    private fun box(canvas: Canvas, x: Float, y: Float, w: Float, h: Float, radius: Float, fill: Boolean = false) {
        ink.style = if (fill) Paint.Style.FILL else Paint.Style.STROKE
        shape.set(x, y, x + w, y + h)
        canvas.drawRoundRect(shape, radius, radius, ink)
    }

    override fun onDraw(canvas: Canvas) {
        val t = if (motionEnabled) (now() - t0) / 1000f else 0f
        canvas.save()
        val scale = min(width / 240f, height / 136f)
        canvas.translate((width - 240 * scale) / 2, (height - 136 * scale) / 2)
        canvas.scale(scale, scale)
        ink.strokeWidth = 3f
        ink.alpha = 255
        box(canvas, 47f, 10f, 54f, 88f, 9f)
        box(canvas, 54f, 30f, 40f, 27f, 3f, true)
        ink.color = context.getColor(R.color.ds_bg_surface)
        box(canvas, 60f, 36f, 8f, 5f, 0f, true)
        ink.color = context.getColor(R.color.ds_text_primary)
        canvas.drawLine(69f, 87f, 79f, 87f, ink)
        // Lector fijo: carcasa, pantalla NFC y base para reconocerlo fácilmente.
        ink.alpha = 255
        box(canvas, 163f, 29f, 51f, 58f, 7f)
        box(canvas, 171f, 37f, 35f, 29f, 3f)
        ink.style = Paint.Style.FILL
        ink.textAlign = Paint.Align.CENTER
        ink.textSize = 10f
        canvas.drawText("NFC", 188.5f, 55f, ink)
        ink.style = Paint.Style.STROKE
        canvas.drawLine(188f, 88f, 188f, 96f, ink)
        canvas.drawLine(173f, 96f, 203f, 96f, ink)
        for (i in 0..2) {
            ink.alpha = if (motionEnabled) (115 + 100 * (0.5 + 0.5 * sin(t * 1.8 - i * 0.8))).toInt() else 190
            val radius = 12f + i * 10f
            shape.set(100 - radius, 54 - radius, 100 + radius, 54 + radius)
            canvas.drawArc(shape, -45f, 90f, false, ink)
        }
        for (i in 0..1) {
            val x = if (i == 0) 35f else 222f
            val y = if (i == 0) 26f else 85f
            val size = 4f + if (motionEnabled) sin(t * 1.3 + i * 2).toFloat() else 0f
            ink.alpha = if (motionEnabled) (155 + 70 * sin(t * 1.3 + i * 2)).toInt() else 200
            ink.style = Paint.Style.FILL
            star.reset()
            star.moveTo(x, y - size * 1.5f)
            star.lineTo(x + size * 0.4f, y - size * 0.4f)
            star.lineTo(x + size, y)
            star.lineTo(x + size * 0.4f, y + size * 0.4f)
            star.lineTo(x, y + size * 1.5f)
            star.lineTo(x - size * 0.4f, y + size * 0.4f)
            star.lineTo(x - size, y)
            star.lineTo(x - size * 0.4f, y - size * 0.4f)
            star.close()
            canvas.drawPath(star, ink)
        }
        canvas.drawText("Tu teléfono", 74f, 119f, label)
        canvas.drawText("Lector del aula", 188f, 119f, label)
        canvas.restore()
        if (motionEnabled && isShown) postInvalidateDelayed(48)
    }
}


/** Decorative burst only after a successful local NFC credential response. */
class ConfettiView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private data class Piece(val vx: Float, val vy: Float, val spin: Float, val color: Int)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var pieces = emptyList<Piece>()
    private var animator: ValueAnimator? = null
    private var progress = 1f

    fun burst() {
        animator?.cancel()
        if (!motionEnabled || !isShown) return
        val colors = intArrayOf(context.getColor(R.color.ds_state_ok_solid),
            context.getColor(R.color.ds_state_regular_solid), context.getColor(R.color.ds_brand_air_to))
        pieces = List(40) { i ->
            val angle = kotlin.random.Random.nextFloat() * 2f * Math.PI.toFloat()
            val speed = dp(100f + kotlin.random.Random.nextFloat() * 180f)
            Piece(cos(angle) * speed, -abs(sin(angle)) * speed - dp(70f),
                kotlin.random.Random.nextFloat() * 540f, colors[i % colors.size])
        }
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1400
            interpolator = android.view.animation.LinearInterpolator()
            addUpdateListener { progress = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (progress >= 1f) return
        val t = progress * 1.4f
        pieces.forEach {
            paint.color = it.color
            paint.alpha = (255f * (1f - progress)).toInt()
            canvas.save()
            canvas.translate(width / 2f + it.vx * t, height * .45f + it.vy * t + dp(240f) * t * t)
            canvas.rotate(it.spin * progress)
            canvas.drawRect(-dp(3f), -dp(5f), dp(3f), dp(5f), paint)
            canvas.restore()
        }
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (visibility != VISIBLE) { animator?.cancel(); progress = 1f }
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        super.onDetachedFromWindow()
    }
}
