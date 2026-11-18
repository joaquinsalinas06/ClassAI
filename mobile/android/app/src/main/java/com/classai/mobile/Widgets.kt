package com.classai.mobile

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SurfaceTexture
import android.graphics.Typeface
import android.media.MediaPlayer
import android.text.SpannableStringBuilder
import android.text.TextPaint
import android.text.style.MetricAffectingSpan
import android.util.AttributeSet
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat
import androidx.core.graphics.ColorUtils
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

// Motion de design/tokens.json (motion.easing / motion.duration). Duraciones: R.integer.ds_motion_*.
object Motion {
    val standard = PathInterpolator(0.2f, 0f, 0f, 1f)
    val enter = PathInterpolator(0f, 0f, 0.2f, 1f)
    val exit = PathInterpolator(0.4f, 0f, 1f, 1f)
    val emphasized = PathInterpolator(0.3f, 0f, 0f, 1f)
}

fun View.ms(id: Int) = resources.getInteger(id).toLong()
private fun View.dp(v: Float) = v * resources.displayMetrics.density

/** Entrada: aparece y sube 16 dp, escalonada. Sin animaciones, aparece directo. */
fun View.enter(index: Int = 0, distance: Float = 16f) {
    animate().cancel()
    if (!motionEnabled) { alpha = 1f; translationY = 0f; return }
    alpha = 0f; translationY = dp(distance)
    animate().alpha(1f).translationY(0f).setStartDelay(index * 55L)
        .setDuration(ms(R.integer.ds_motion_slow)).setInterpolator(Motion.standard).start()
}

/** Presión táctil: escala 0.97 y vuelve. */
fun View.pressable() {
    setOnTouchListener { v, e ->
        when (e.actionMasked) {
            android.view.MotionEvent.ACTION_DOWN -> if (motionEnabled) v.animate().scaleX(0.97f).scaleY(0.97f)
                .setDuration(ms(R.integer.ds_motion_instant) + 40).setInterpolator(Motion.standard).start()
            android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> v.animate().scaleX(1f).scaleY(1f)
                .setDuration(ms(R.integer.ds_motion_fast)).setInterpolator(Motion.standard).start()
        }
        false
    }
}

/** Número que cuenta hasta el nuevo valor (solo si cambió). */
fun TextView.countTo(value: Double?, format: (Double) -> String) {
    val previous = getTag(R.id.count_value) as? Double
    setTag(R.id.count_value, value)
    (getTag(R.id.count_anim) as? ValueAnimator)?.cancel()
    if (value == null) { text = "—"; return }
    if (previous == null || previous == value || !motionEnabled) { text = format(value); return }
    val anim = ValueAnimator.ofFloat(previous.toFloat(), value.toFloat()).apply {
        duration = ms(R.integer.ds_motion_update) + 220
        interpolator = Motion.emphasized
        addUpdateListener { text = format((it.animatedValue as Float).toDouble()) }
    }
    setTag(R.id.count_anim, anim)
    anim.start()
}

// Títulos en Figtree: las *palabras* marcadas van en ExtraBold.
private class FaceSpan(val face: Typeface) : MetricAffectingSpan() {
    override fun updateDrawState(tp: TextPaint) { tp.typeface = face }
    override fun updateMeasureState(tp: TextPaint) { tp.typeface = face }
}

fun Context.emph(text: String): CharSequence {
    val italic = ResourcesCompat.getFont(this, R.font.figtree_extrabold) ?: return text.replace("*", "")
    val out = SpannableStringBuilder()
    text.split("*").forEachIndexed { i, part ->
        val start = out.length
        out.append(part)
        if (i % 2 == 1) out.setSpan(FaceSpan(italic), start, out.length, 0)
    }
    return out
}

private fun View.color(id: Int) = context.getColor(id)

/** Medidor de confort: arco de 240° con color por estado y valor animado. */
class GaugeView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; color = color(R.color.ds_border_default) }
    private val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val tick = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(R.color.ds_text_faint) }
    private val box = RectF()
    private var shown = 0f
    private var anim: ValueAnimator? = null
    var tint = color(R.color.ds_state_offline_solid)
        set(v) { field = v; invalidate() }

    /** 0..100, o null sin dato. */
    fun setValue(v: Double?) {
        val target = ((v ?: 0.0) / 100.0).toFloat().coerceIn(0f, 1f)
        anim?.cancel()
        if (!motionEnabled) { shown = target; invalidate(); return }
        anim = ValueAnimator.ofFloat(shown, target).apply {
            duration = ms(R.integer.ds_motion_chart); interpolator = Motion.emphasized
            addUpdateListener { shown = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        val stroke = min(width, height) * 0.085f
        track.strokeWidth = stroke; arc.strokeWidth = stroke
        val r = min(width, height) / 2f - stroke
        box.set(width / 2f - r, height / 2f - r, width / 2f + r, height / 2f + r)
        canvas.drawArc(box, 150f, 240f, false, track)
        // marcas de umbral (60 y 80 de 100, como en la web)
        for (mark in floatArrayOf(0.6f, 0.8f)) {
            val a = Math.toRadians((150 + 240 * mark).toDouble())
            canvas.drawCircle(width / 2f + (r + stroke * 1.3f) * kotlin.math.cos(a).toFloat(),
                height / 2f + (r + stroke * 1.3f) * sin(a).toFloat(), stroke * 0.18f, tick)
        }
        if (shown > 0.001f) {
            arc.shader = LinearGradient(box.left, box.bottom, box.right, box.top,
                ColorUtils.setAlphaComponent(tint, 150), tint, Shader.TileMode.CLAMP)
            canvas.drawArc(box, 150f, 240f * shown, false, arc)
        }
    }
}

/** Barra con banda objetivo y relleno en gradiente hasta el valor. */
class RangeBarView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(R.color.ds_bg_selected) }
    private val band = Paint(Paint.ANTI_ALIAS_FLAG)
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val knob = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(R.color.ds_bg_surface) }
    private val knobRing = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val r = RectF()
    private var shown = 0f
    private var anim: ValueAnimator? = null
    private var bandFrom = -1f
    private var bandTo = -1f
    var tint = color(R.color.ds_metric_rh)

    /** Todo normalizado 0..1; banda <0 = sin banda. */
    fun set(value: Float?, from: Float = -1f, to: Float = -1f) {
        bandFrom = from; bandTo = to
        val target = (value ?: 0f).coerceIn(0f, 1f)
        anim?.cancel()
        if (!motionEnabled) { shown = target; invalidate(); return }
        anim = ValueAnimator.ofFloat(shown, target).apply {
            duration = ms(R.integer.ds_motion_chart); interpolator = Motion.emphasized
            addUpdateListener { shown = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        val h = dp(8f)
        val top = height / 2f - h / 2
        val w = width - h
        r.set(h / 2, top, width - h / 2, top + h)
        canvas.drawRoundRect(r, h, h, track)
        if (bandFrom >= 0f) {
            band.color = ColorUtils.setAlphaComponent(color(R.color.ds_state_ok_solid), 70)
            r.set(h / 2 + w * bandFrom, top, h / 2 + w * bandTo, top + h)
            canvas.drawRoundRect(r, h, h, band)
        }
        val x = h / 2 + w * shown
        fill.shader = LinearGradient(0f, 0f, max(x, 1f), 0f, ColorUtils.setAlphaComponent(tint, 60), tint, Shader.TileMode.CLAMP)
        r.set(h / 2, top, x, top + h)
        canvas.drawRoundRect(r, h, h, fill)
        knobRing.color = tint; knobRing.strokeWidth = dp(3f)
        canvas.drawCircle(x, height / 2f, h * 0.85f, knob)
        canvas.drawCircle(x, height / 2f, h * 0.85f, knobRing)
    }
}

/** Ruido: barras verticales que oscilan suave; cuántas se encienden depende del nivel. */
class LevelBarsView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val on = Paint(Paint.ANTI_ALIAS_FLAG)
    private val off = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(R.color.ds_bg_selected) }
    private val r = RectF()
    private val t0 = System.nanoTime()
    private var level = 0f
    private var shown = 0f
    private var anim: ValueAnimator? = null
    var tint = color(R.color.ds_metric_noise)

    fun set(v: Float) {
        level = v
        anim?.cancel()
        if (!motionEnabled) { shown = v; invalidate(); return }
        anim = ValueAnimator.ofFloat(shown, v).apply {
            duration = ms(R.integer.ds_motion_update); interpolator = Motion.standard
            addUpdateListener { shown = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        val n = 12
        val gap = dp(3f)
        val bw = (width - gap * (n - 1)) / n
        val t = (System.nanoTime() - t0) / 1e9f
        for (i in 0 until n) {
            val f = (i + 1f) / n
            val lit = f <= shown + 0.001f
            val wobble = if (motionEnabled && lit) 0.12f * sin(t * 6f + i * 0.9f) else 0f
            val bh = height * (0.45f + 0.55f * f) * (1f + wobble).coerceIn(0.2f, 1f)
            r.set(i * (bw + gap), height - bh, i * (bw + gap) + bw, height.toFloat())
            on.color = ColorUtils.blendARGB(ColorUtils.setAlphaComponent(tint, 120), tint, f)
            canvas.drawRoundRect(r, bw / 2, bw / 2, if (lit) on else off)
        }
        if (motionEnabled && isShown && shown > 0f) postInvalidateDelayed(48)
    }
}

/** Mini gráfico de la clase: línea con relleno en gradiente que se dibuja al entrar. */
class SparklineView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = dp(2.5f); strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val area = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private val fillPath = Path()
    private var values = emptyList<Float>()
    private var reveal = 1f
    var tint = color(R.color.ds_metric_comfort)

    fun set(v: List<Double>) {
        val next = v.map { it.toFloat() }
        val first = values.isEmpty()
        values = next
        if (first && motionEnabled && next.size > 1) {
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = ms(R.integer.ds_motion_chart); interpolator = Motion.emphasized
                addUpdateListener { reveal = it.animatedValue as Float; invalidate() }
                start()
            }
        } else invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        if (values.size < 2) return
        val lo = values.min(); val hi = max(values.max(), lo + 5f)
        val pad = dp(4f)
        fun x(i: Int) = pad + (width - 2 * pad) * i / (values.size - 1)
        fun y(v: Float) = pad + (height - 2 * pad) * (1f - (v - lo) / (hi - lo))
        path.reset(); fillPath.reset()
        values.forEachIndexed { i, v -> if (i == 0) path.moveTo(x(i), y(v)) else path.lineTo(x(i), y(v)) }
        fillPath.addPath(path); fillPath.lineTo(x(values.size - 1), height.toFloat()); fillPath.lineTo(x(0), height.toFloat()); fillPath.close()
        line.color = tint
        area.shader = LinearGradient(0f, 0f, 0f, height.toFloat(), ColorUtils.setAlphaComponent(tint, 70), ColorUtils.setAlphaComponent(tint, 0), Shader.TileMode.CLAMP)
        canvas.save()
        canvas.clipRect(0f, 0f, width * reveal, height.toFloat())
        canvas.drawPath(fillPath, area)
        canvas.drawPath(path, line)
        canvas.restore()
        if (reveal >= 1f) {
            dot.color = tint
            canvas.drawCircle(x(values.size - 1), y(values.last()), dp(4f), dot)
        }
    }
}

/** Punto "en vivo" con un anillo que se expande. */
class PulseDotView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val core = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG)
    private val t0 = System.nanoTime()
    var tint = color(R.color.ds_state_alert_solid)
        set(v) { field = v; invalidate() }
    var pulsing = true
        set(v) { field = v; invalidate() }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f; val cy = height / 2f
        val rCore = min(width, height) * 0.22f
        core.color = tint
        if (pulsing && motionEnabled) {
            val f = ((System.nanoTime() - t0) / 1e9f / 1.6f) % 1f
            ring.color = ColorUtils.setAlphaComponent(tint, (110 * (1 - f)).toInt())
            canvas.drawCircle(cx, cy, rCore + (min(width, height) / 2f - rCore) * f, ring)
            if (isShown) postInvalidateOnAnimation()
        }
        canvas.drawCircle(cx, cy, rCore, core)
    }
}

/** Ícono dentro de un anillo de progreso (tarjetas de métricas). */
class RingView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val bg = Paint(Paint.ANTI_ALIAS_FLAG)
    private val box = RectF()
    private var shown = 0f
    var tint = color(R.color.ds_metric_temp)
        set(v) { field = v; invalidate() }

    fun set(progress: Float) {
        val target = progress.coerceIn(0f, 1f)
        if (!motionEnabled) { shown = target; invalidate(); return }
        ValueAnimator.ofFloat(shown, target).apply {
            duration = ms(R.integer.ds_motion_chart); interpolator = Motion.emphasized
            addUpdateListener { shown = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        val s = dp(3f)
        track.strokeWidth = s; arc.strokeWidth = s
        val r = min(width, height) / 2f - s
        box.set(width / 2f - r, height / 2f - r, width / 2f + r, height / 2f + r)
        bg.color = ColorUtils.setAlphaComponent(tint, 28)
        canvas.drawCircle(width / 2f, height / 2f, r, bg)
        track.color = ColorUtils.setAlphaComponent(tint, 45)
        canvas.drawArc(box, -90f, 360f, false, track)
        arc.color = tint
        canvas.drawArc(box, -90f, 360f * shown, false, arc)
    }
}

/** Esqueleto de carga con brillo que barre (en vez de spinner). */
class ShimmerView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val base = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(R.color.ds_bg_selected) }
    private val shine = Paint(Paint.ANTI_ALIAS_FLAG)
    private val m = Matrix()
    private val r = RectF()
    private val t0 = System.nanoTime()

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        val hi = ColorUtils.setAlphaComponent(color(R.color.ds_bg_hover), 255)
        shine.shader = LinearGradient(0f, 0f, w * 0.5f, 0f, intArrayOf(0, hi, 0), null, Shader.TileMode.CLAMP)
    }

    override fun onDraw(canvas: Canvas) {
        val rad = resources.getDimension(R.dimen.app_radius_card)
        r.set(0f, 0f, width.toFloat(), height.toFloat())
        canvas.drawRoundRect(r, rad, rad, base)
        if (!motionEnabled) return
        val f = ((System.nanoTime() - t0) / 1e9f / 1.3f) % 1f
        m.setTranslate(-width * 0.5f + f * width * 1.5f, 0f)
        shine.shader?.setLocalMatrix(m)
        canvas.drawRoundRect(r, rad, rad, shine)
        if (isShown) postInvalidateOnAnimation()
    }
}

/**
 * Kirby en video (res/raw), recortado al centro y en bucle, sin audio.
 * Encima de un póster fijo: se ve igual mientras carga y con animaciones desactivadas.
 */
class KirbyView(context: Context, attrs: AttributeSet? = null) : FrameLayout(context, attrs), TextureView.SurfaceTextureListener {
    private val poster = ImageView(context).apply { scaleType = ImageView.ScaleType.CENTER_CROP; importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
    private val video = TextureView(context).apply { alpha = 0f }
    private var player: MediaPlayer? = null
    private var surface: Surface? = null
    private var mood: Mood? = null
    /** Desplaza el encuadre (−1 izquierda .. 1 derecha) para dejar sitio al texto. */
    var focusX = 0f

    init {
        addView(poster, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(video, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        video.surfaceTextureListener = this
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun show(m: Mood) {
        if (m == mood) return
        val first = mood == null
        mood = m
        val (raw, still) = when (m) {
            Mood.COLD -> R.raw.kirby_frio to R.drawable.kirby_frio
            Mood.HOT -> R.raw.kirby_calor to R.drawable.kirby_calor
            Mood.OK -> R.raw.kirby_esp to R.drawable.kirby_esp
        }
        if (!first && motionEnabled) {
            // crossfade: el póster nuevo aparece debajo y el video se desvanece
            poster.alpha = 0.4f
            poster.animate().alpha(1f).setDuration(ms(R.integer.ds_motion_base)).start()
        }
        poster.setImageResource(still)
        video.animate().alpha(0f).setDuration(ms(R.integer.ds_motion_fast)).start()
        play(raw)
    }

    private fun play(raw: Int) {
        player?.release(); player = null
        val s = surface ?: return
        if (!motionEnabled) return
        try {
            player = MediaPlayer.create(context, raw)?.apply {
                setSurface(s); isLooping = true; setVolume(0f, 0f)
                setOnVideoSizeChangedListener { _, w, h -> fit(w, h) }
                setOnInfoListener { _, what, _ ->
                    if (what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START)
                        video.animate().alpha(1f).setDuration(ms(R.integer.ds_motion_base)).start()
                    false
                }
                start()
            }
        } catch (e: Exception) { player = null }  // sin video queda el póster
    }

    private fun fit(vw: Int, vh: Int) {
        if (vw == 0 || vh == 0 || width == 0) return
        val scale = max(width / vw.toFloat(), height / vh.toFloat())
        val sx = vw * scale / width; val sy = vh * scale / height
        val m = Matrix()
        m.setScale(sx, sy, width / 2f, height / 2f)
        m.postTranslate(focusX * (vw * scale - width) / 2f, 0f)
        video.setTransform(m)
    }

    override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) {
        surface = Surface(st)
        mood?.let { val m = it; mood = null; show(m) }
    }
    override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) { player?.let { fit(it.videoWidth, it.videoHeight) } }
    override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
        player?.release(); player = null; surface?.release(); surface = null; video.alpha = 0f
        return true
    }
    override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}

    override fun onVisibilityAggregated(isVisible: Boolean) {
        super.onVisibilityAggregated(isVisible)
        player?.let { if (isVisible) it.start() else if (it.isPlaying) it.pause() }
    }
}
