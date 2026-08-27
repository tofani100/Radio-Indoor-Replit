import { useState } from "react";
import { useLocation } from "wouter";
import { Radio, Eye, EyeOff } from "lucide-react";
import { useAdminLogin, handleStandaloneRequest } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("admin@radioindoor.com");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // States for password reset / admin creation modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetName, setResetName] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  const handleSaveNewAdmin = async () => {
    const cleanEmail = resetEmail.trim().toLowerCase();
    const cleanPass = resetPassword.trim();
    if (!cleanEmail || !cleanPass) {
      toast({ title: "Preencha todos os campos", description: "Informe o e-mail e a nova senha.", variant: "destructive" });
      return;
    }

    try {
      // 1. Salvar no backup resiliente do localStorage
      const storageKey = "radio_indoor_admins_backup";
      let admins: any[] = [];
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) admins = JSON.parse(raw);
      } catch {
        admins = [];
      }
      if (!Array.isArray(admins)) admins = [];

      const idx = admins.findIndex((a) => a.email && a.email.toLowerCase() === cleanEmail);
      const newAdminObj = {
        id: idx >= 0 ? admins[idx].id : Date.now(),
        name: resetName.trim() || (idx >= 0 ? admins[idx].name : "Administrador"),
        email: cleanEmail,
        passwordHash: cleanPass,
        role: "admin",
        createdAt: new Date().toISOString(),
      };

      if (idx >= 0) {
        admins[idx] = newAdminObj;
      } else {
        admins.push(newAdminObj);
      }
      localStorage.setItem(storageKey, JSON.stringify(admins));

      // 2. Chamar o store standalone para sincronizar
      await handleStandaloneRequest("/api/admin/users", "POST", {
        name: newAdminObj.name,
        email: cleanEmail,
        password: cleanPass,
      }).catch(() => {});

      // 3. Preencher automaticamente os campos de login
      setEmail(cleanEmail);
      setPassword(cleanPass);
      toast({
        title: "Acesso administrativo salvo!",
        description: `Login configurado para ${cleanEmail}. Você já pode clicar em Entrar.`,
      });
      setResetModalOpen(false);
      setResetPassword("");
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message || "Falha ao salvar acesso.", variant: "destructive" });
    }
  };

  const handleRestoreDefaults = async () => {
    try {
      const storageKey = "radio_indoor_admins_backup";
      const defaults = [
        { id: 1, name: "Administrador Principal", email: "admin@radioindoor.com", passwordHash: "admin123", role: "admin", createdAt: new Date().toISOString() },
        { id: 2, name: "Admin Master", email: "tofani100@gmail.com", passwordHash: "admin123", role: "admin", createdAt: new Date().toISOString() },
      ];
      localStorage.setItem(storageKey, JSON.stringify(defaults));
      await handleStandaloneRequest("/api/admin/reset-password", "POST", { email: "admin@radioindoor.com", newPassword: "admin123" }).catch(() => {});
      await handleStandaloneRequest("/api/admin/reset-password", "POST", { email: "tofani100@gmail.com", newPassword: "admin123" }).catch(() => {});
      setEmail("admin@radioindoor.com");
      setPassword("admin123");
      toast({ title: "Acessos padrão restaurados!", description: "admin@radioindoor.com e tofani100@gmail.com (senha: admin123)." });
      setResetModalOpen(false);
    } catch (e: any) {
      toast({ title: "Erro ao restaurar", description: e.message, variant: "destructive" });
    }
  };

  const login = useAdminLogin({
    mutation: {
      onSuccess: (user) => {
        setUser(user as { id: number; email: string; name: string; role: string });
        toast({ title: "Bem-vindo!", description: "Acesso administrativo liberado." });
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
        setUser(res.data as { id: number; email: string; name: string; role: string });
        toast({ title: "Bem-vindo!", description: "Acesso administrativo liberado." });
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
              disabled={isSubmitting || login.isPending}
              className="w-full py-3 px-4 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting || login.isPending ? "Entrando..." : "Entrar"}
            </button>

            <div className="pt-2 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setResetModalOpen(true)}
                className="text-sidebar-primary hover:underline font-medium transition-colors"
              >
                Esqueci a senha / Criar novo Login Admin
              </button>
            </div>
          </form>

          <p className="mt-8 text-center text-xs text-sidebar-foreground/30 font-mono">
            Radio Indoor &copy; {new Date().getFullYear()} &bull; v0.2.1
          </p>
        </div>
      </div>

      {/* Modal para Redefinir Senha ou Criar Novo Login de Administrador */}
      <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent className="w-[94vw] max-w-md p-6 bg-card border border-card-border rounded-xl shadow-2xl overflow-hidden">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-semibold text-foreground">Recuperação e Gestão de Logins</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-muted-foreground">
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Crie um novo login de administrador, redefina a senha de um existente ou restaure o acesso padrão com um clique.
            </p>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Nome do Administrador (opcional)</label>
                <input
                  type="text"
                  value={resetName}
                  onChange={(e) => setResetName(e.target.value)}
                  placeholder="Ex: Administrador Master"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-sidebar-accent/60 border border-sidebar-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary box-border transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">E-mail Administrativo</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="Ex: seu-email@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-sidebar-accent/60 border border-sidebar-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary box-border transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Nova Senha</label>
                <div className="relative w-full">
                  <input
                    type={showResetPassword ? "text" : "password"}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Digite a nova senha"
                    className="w-full px-3.5 py-2.5 pr-11 rounded-lg bg-sidebar-accent/60 border border-sidebar-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary box-border transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((v) => !v)}
                    aria-label={showResetPassword ? "Ocultar senha" : "Mostrar senha"}
                    title={showResetPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4 sm:justify-between border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRestoreDefaults}
              className="text-xs h-9"
            >
              Restaurar Padrão (admin123)
            </Button>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setResetModalOpen(false)}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveNewAdmin}
                className="text-xs h-9 bg-primary text-primary-foreground font-semibold hover:opacity-90"
              >
                Salvar / Criar Acesso
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
