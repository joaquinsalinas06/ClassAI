import { useQueryClient } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { LogoMark } from "../app/Logo";
import { api, ApiError, useMe } from "../lib/api";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { inputClass } from "../ui/cn";

export function Login() {
  const me = useMe();
  const client = useQueryClient();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me.data) return <Navigate replace to={from} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.login(username.trim(), password);
      client.setQueryData(["me"], result);
      navigate(from, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Usuario o contraseña incorrectos" : e instanceof Error ? e.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-[360px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark size={36} />
          <div>
            <h1 className="text-title text-fg">ClassAI</h1>
            <p className="mt-1 text-body text-muted">Panel docente</p>
          </div>
        </div>
        <Card className="p-5">
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-fg">Usuario</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-fg">Contraseña</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className={inputClass} />
            </label>
            {error && <p role="alert" className="rounded-md border border-alert-border bg-alert-subtle px-3 py-2 text-label text-alert-text">{error}</p>}
            <Button type="submit" variant="primary" className="h-9 w-full" icon={<LogIn size={15} aria-hidden />} disabled={busy || !username.trim() || !password}>
              {busy ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-caption text-muted">¿Sin cuenta? Pide al administrador que te cree un usuario docente.</p>
      </div>
    </main>
  );
}
