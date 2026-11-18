import { Download, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { LogoMark } from "../app/Logo";
import { cn } from "../ui/cn";
import { EASE } from "../ui/motion";

const APK = "/app/classai.apk";
const STEPS = [
  { title: "Descarga el archivo", text: "Toca «Descargar para Android». El archivo se llama classai.apk." },
  { title: "Permite instalar apps de fuentes desconocidas", text: "Al abrirlo, Android te pedirá permiso: entra en Ajustes y activa «Permitir de esta fuente» para tu navegador." },
  { title: "Instala y entra", text: "Vuelve, toca «Instalar» y abre ClassAI. Inicia sesión con tu código de alumno." },
];

// iPadOS se presenta como Mac; el toque delata al iPad.
const isIos = typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

const rise = (i: number) => ({
  initial: { opacity: 0, transform: "translateY(10px)" },
  animate: { opacity: 1, transform: "translateY(0px)" },
  transition: { duration: 0.42, ease: EASE.emphasized, delay: 0.06 + i * 0.06 },
});

/** Página pública (sin login) para instalar la app de alumnos: botón, QR de esta misma página y pasos. */
export function AppDownload() {
  return (
    <main className="min-h-dvh bg-page px-4 py-8 sm:py-14">
      <div className="mx-auto grid w-full max-w-[920px] items-start gap-8 md:grid-cols-[1fr_300px] md:gap-12">
        <div className="flex flex-col">
          <motion.div {...rise(0)} className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="text-heading text-fg">ClassAI</span>
          </motion.div>

          <motion.h1 {...rise(1)} className="mt-8 text-display text-balance text-fg">Descarga la app de ClassAI</motion.h1>
          <motion.p {...rise(2)} className="mt-3 max-w-[46ch] text-body text-fg-2">
            Marca tu asistencia acercando el celular al lector del aula y cuéntale al profesor cómo se siente la clase.
          </motion.p>

          {isIos && (
            <motion.p {...rise(3)} role="alert" className="mt-5 flex items-start gap-2.5 rounded-md border border-regular-border bg-regular-subtle px-3 py-2.5 text-label text-regular-text">
              <TriangleAlert size={16} className="mt-0.5" aria-hidden />
              <span>La app es solo para Android. En iPhone no se puede instalar: pide a tu profesor que marque tu asistencia con tarjeta.</span>
            </motion.p>
          )}

          <motion.div {...rise(3)} className="mt-6 flex flex-col gap-2">
            <a
              href={APK}
              download="classai.apk"
              type="application/vnd.android.package-archive"
              className={cn(
                "inline-flex h-14 select-none items-center justify-center gap-2.5 rounded-lg bg-ink px-6 text-heading font-semibold text-on-ink shadow-sm",
                "transition-[transform,opacity] duration-150 ease-standard active:scale-[0.97] sm:w-fit sm:px-8",
                "[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-90",
                isIos && "opacity-60",
              )}
            >
              <Download size={20} aria-hidden />
              Descargar para Android
            </a>
            <p className="num flex items-center gap-1.5 text-caption text-muted">
              <Smartphone size={13} aria-hidden />
              Versión 2.0 · 5,6 MB · Android 8 o superior
            </p>
          </motion.div>

          <motion.ol {...rise(4)} className="mt-9 flex flex-col gap-4" aria-label="Cómo instalarla">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3.5">
                <span className="num flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-label font-semibold text-fg">{i + 1}</span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-label font-semibold text-fg">{step.title}</p>
                  <p className="mt-0.5 max-w-[52ch] text-small text-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </motion.ol>

          <motion.p {...rise(5)} className="mt-8 flex items-start gap-2 text-caption text-muted">
            <ShieldCheck size={14} className="mt-px" aria-hidden />
            La descarga viene del servidor de ClassAI. Si Android muestra un aviso de Play Protect, toca «Instalar de todas formas».
          </motion.p>
        </div>

        <motion.aside
          initial={{ opacity: 0, transform: "translateY(10px) scale(0.98)" }}
          animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
          transition={{ duration: 0.5, ease: EASE.emphasized, delay: 0.22 }}
          className="order-last rounded-xl border border-line bg-surface p-5 shadow-sm md:sticky md:top-14 md:order-none md:mt-20"
        >
          <p className="text-label font-semibold text-fg">¿Estás en la computadora?</p>
          <p className="mt-0.5 text-small text-muted">Escanea el código con la cámara del celular.</p>
          <div className="mx-auto mt-4 max-w-[220px] rounded-lg bg-white p-3 md:max-w-none md:p-4">
            <img src="/app/qr.svg" alt="Código QR de classai.myschool.com.pe/app" width={232} height={232} className="block h-auto w-full [image-rendering:pixelated]" />
          </div>
          <p className="mt-3 text-center text-caption text-muted">classai.myschool.com.pe/app</p>
        </motion.aside>
      </div>
    </main>
  );
}
