import { useState } from "react";
import { useLocation } from "wouter";
import { Radio, Eye, EyeOff } from "lucide-react";
import { useAdminLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const login = useAdminLogin({
    mutation: {
      onSuccess: (user) => {
        setUser(user as { id: number; email: string; name: string; role: string });
        setLocation("/dashboard");
      },
      onError: () => {
        toast({ title: "Credenciais invalidas", description: "Verifique seu email e senha.", variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ data: { email, password } });
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
            "Gerenciamento profissional de audio para seus clientes — em qualquer estabelecimento."
          </blockquote>
          <p className="mt-6 text-sm text-sidebar-foreground/40 uppercase tracking-widest">Sistema de Radio Indoor</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[["Multi-Tenant", "Gestao de multiplos clientes"], ["PWA Player", "Toca em qualquer dispositivo"], ["Relatorios", "Comprove cada execucao"]].map(([title, desc]) => (
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
          <p className="text-sm text-sidebar-foreground/50 mb-8">Entre com suas credenciais para continuar.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-sidebar-foreground/60 mb-1.5 uppercase tracking-wide">Email</label>
              <input
                data-testid="input-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@radioindoor.com"
                required
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
                  className="w-full px-4 py-3 pr-12 rounded-lg bg-sidebar-accent border border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/30 text-sm focus:outline-none focus:ring-2 focus:ring-sidebar-primary transition-all"
                />
                <button
                  data-testid="button-toggle-password"
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-white hover:text-sidebar-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" strokeWidth={2.25} /> : <Eye className="w-5 h-5" strokeWidth={2.25} />}
                </button>
              </div>
            </div>
            <button
              data-testid="button-submit"
              type="submit"
              disabled={login.isPending}
              className="w-full py-3 px-4 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {login.isPending ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-sidebar-foreground/30 font-mono">
            Radio Indoor &copy; {new Date().getFullYear()} &bull; v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
}
