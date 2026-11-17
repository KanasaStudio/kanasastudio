import { Lock, LogIn } from "lucide-react";
import { FormEvent, useState } from "react";
import logo from "../assets/logo-white.png";
import { Button, Field, inputCls } from "../components/ui";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useStore } from "../store/useStore";

export default function LoginPage({ notFounder }: { notFounder?: boolean }) {
  useTheme();
  const signOut = useStore((s) => s.signOut);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Email atau kata sandi salah." : error.message);
  };
  return (
    <div className="pt-safe flex min-h-[100dvh] flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-6 flex w-fit items-center gap-3 rounded-3xl bg-ink px-4 py-3 text-ink-text shadow-card">
          <img src={logo} alt="" className="h-12 w-12" />
          <div className="text-xl font-black leading-tight">Kanasa<br />Studio</div>
        </div>
        <h1 className="text-center text-2xl font-black">Autonomous AI Company</h1>
        <p className="mt-1 text-center text-sm text-muted">Masuk sebagai Founder untuk membuka kantor virtual dan tim AI-mu.</p>
        {notFounder ? (
          <div className="mt-6 rounded-3xl border border-bad/40 bg-bad-soft p-4 text-sm text-bad">
            Akun ini bukan Founder KANASA STUDIO. Hanya akun owner yang bisa mengakses perusahaan AI.
            <Button className="mt-3 w-full" onClick={signOut}>Keluar</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3 rounded-[28px] border border-line bg-surface p-5 shadow-card">
            <Field label="Email"><input className={inputCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Kata sandi"><input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {error && <div className="rounded-2xl bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{error}</div>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}><LogIn className="h-5 w-5" /> Masuk</Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted"><Lock className="h-3.5 w-3.5" /> Pakai akun owner website Kanasa Studio.</p>
          </form>
        )}
      </div>
    </div>
  );
}
