import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Radio, Eye, EyeOff, PlayCircle, Info } from "lucide-react";
import { useAdminLogin, handleStandaloneRequest } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { user, setUser } = useAuth();
  const { toast } = useToast();

  // If already authenticated as the master admin tofani100@gmail.com, can prefill or redirect
  const isMasterUser = user?.email?.toLowerCase() === "tofani100@gmail.com";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isMasterUser) {
      setEmail("tofani100@gmail.com");
    }
  }, [isMasterUser]);

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const login = useAdminLogin({
    mutation: {
      onSuccess: (userData) => {
        try {
          localStorage.setItem("radio_indoor_trusted_admin", (userData as any)?.email || "admin");
        } catch {
          // ignore
        }
        setUser(userData as { id: number; email: string; name: string; role: string });
        toast({ title: "Bem-vindo!", description: "Acesso liberado com sucesso." });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        const msg = err?.data?.message || err?.message || "Verifique seu email e senha.";
        toast({ title: "Erro ao entrar", description: msg, variant: "destructive" });
      },
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await handleStandaloneRequest("/api/auth/login", "POST", { email, password });
      if (res.status === 200 && res.data) {
        try {
          localStorage.setItem("radio_indoor_trusted_admin", res.data.email);
        } catch {
          // ignore
        }
        setUser(res.data as { id: number; email: string; name: string; role: string });
        toast({ title: "Bem-vindo!", description: "Acesso liberado com sucesso." });
        setLocation("/dashboard");
        setIsSubmitting(false);
        return;
      }
    } catch (standaloneErr) {
      console.warn("Direct standalone login:", standaloneErr);
    }

    login.mutate(
      { data: { email, password } },
      {
        onSettled: () => setIsSubmitting(false),
      }
    );
  };

  return (
    <div className="min-h-screen flex bg-sidebar">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 bg-sidebar border-r border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sidebar-primary">
            <Radio className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-sidebar-foreground">Radio Indoor</span>
        </div>
        <div>
          <blockquote className="text-2xl font-light text-sidebar-foreground/80 leading-relaxed">
            "Gerenciamento profissional de áudio para seus clientes — em qualquer estabelecimento."
          </blockquote>
          <p className="mt-6 text-sm text-sidebar-foreground/40 uppercase tracking-widest">Sistema de Rádio Indoor</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[["Multi-Tenant", "Gestão de múltiplos clientes"], ["PWA Player", "Toca em qualquer dispositivo"], ["Relatórios", "Comprove cada execução"]].map(([title, desc]) => (
            <div key={title} className="bg-sidebar-accent rounded-lg p-4">
              <p className="text-xs font-semibold text-sidebar-primary mb-1">{title}</p>
              <p className="text-xs text-sidebar-foreground/50">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sidebar-primary">
              <Radio className="w-4 h-4 text-sidebar-primary-foreground" />
            </div>
            <span className="font-semibold text-sidebar-foreground">Radio Indoor</span>
          </div>

          <h1 className="text-2xl font-semibold text-sidebar-foreground mb-1">Acesso Administrativo</h1>
          <p className="text-sm text-sidebar-foreground/50 mb-6">Entre com suas credenciais de gestor para acessar o painel.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-sidebar-foreground/60 mb-1.5 uppercase tracking-wide">Email</label>
              <input
                data-testid="input-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu-email@dominio.com"
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-lg bg-sidebar-accent border border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/30 text-sm focus:outline-none focus:ring-2 focus:ring-sidebar-primary transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-sidebar-foreground/60 mb-1.5 uppercase tracking-wide">Senha</label>
              <div className="relative">
                <input
                  data-testid="input-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 rounded-lg bg-sidebar-accent border border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/30 text-sm focus:outline-none focus:ring-2 focus:ring-sidebar-primary transition-all"
                />
                <button
                  data-testid="button-toggle-password"
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-white hover:text-sidebar-primary transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" strokeWidth={2.25} /> : <Eye className="w-5 h-5" strokeWidth={2.25} />}
                </button>
              </div>
            </div>
            <button
              data-testid="button-submit"
              type="submit"
              disabled={isSubmitting || login.isPending}
              className="w-full py-3 px-4 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer shadow-md shadow-primary/20"
            >
              {isSubmitting || login.isPending ? "Entrando..." : "Entrar no Painel"}
            </button>
          </form>

          {/* Direct link guidance for clients/stores */}
          <div className="mt-8 p-4 rounded-xl bg-sidebar-accent/70 border border-sidebar-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-sidebar-foreground">
              <Info className="w-4 h-4 text-sidebar-primary shrink-0" />
              <span>É um cliente, loja ou filial?</span>
            </div>
            <p className="text-xs text-sidebar-foreground/70 leading-relaxed">
              Se você deseja apenas reproduzir suas músicas no estabelecimento, você não precisa de login. Acesse o Player diretamente:
            </p>
            <Link
              to="/player"
              className="inline-flex items-center gap-2 text-xs font-semibold text-sidebar-primary hover:underline mt-1 bg-sidebar-primary/10 px-3 py-1.5 rounded-lg border border-sidebar-primary/20 transition-all hover:bg-sidebar-primary/20"
            >
              <PlayCircle className="w-4 h-4" />
              <span>👉 Clique aqui para abrir o Player (https://per.playcomunique.com.br/player)</span>
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-sidebar-foreground/30 font-mono">
            Radio Indoor &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
