import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, ChevronRight, Users, Monitor, Eye, EyeOff, X, Mail } from "lucide-react";
import {
  useListClients, getListClientsQueryKey,
  useCreateClient, useUpdateClient, useDeleteClient,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function secondsToHms(s: number): string {
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function hmsToSeconds(v: string): number {
  // Aceita "HH:MM:SS", "MM:SS", "SS" ou só dígitos
  const parts = v.trim().split(":").map((p) => parseInt(p) || 0);
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0] ?? 0;
}

type Client = {
  id: number; name: string; email: string; masterEmail: string;
  authorizedEmails?: string[];
  playbackMode: string; jingleMode: string; jingleInterval?: number; jingleIntervalSeconds?: number;
  active: boolean; deviceCount?: number; mediaCount?: number; createdAt: string;
};

function ClientModal({ open, onClose, client }: { open: boolean; onClose: () => void; client?: Client }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  // Initialize form from `client` on every mount. Parent uses a `key`
  // tied to client.id so this component re-mounts whenever a different
  // client is being edited — which guarantees fresh state.
  const [form, setForm] = useState({
    name: client?.name ?? "",
    email: client?.email ?? "",
    masterEmail: client?.masterEmail ?? "",
    password: "",
    playbackMode: client?.playbackMode ?? "sequential",
    jingleMode: client?.jingleMode ?? "interval",
    jingleInterval: String(client?.jingleInterval ?? 3),
    jingleIntervalSeconds: String(client?.jingleIntervalSeconds ?? 900),
  });
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>(
    client?.authorizedEmails ?? [],
  );
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const invalidate = () => { qc.invalidateQueries({ queryKey: getListClientsQueryKey() }); onClose(); };

  const create = useCreateClient({ mutation: { onSuccess: () => { toast({ title: "Cliente criado" }); invalidate(); }, onError: () => toast({ title: "Erro ao criar cliente", variant: "destructive" }) } });
  const update = useUpdateClient({ mutation: { onSuccess: () => { toast({ title: "Cliente atualizado" }); invalidate(); }, onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }) } });

  const addEmail = () => {
    const v = emailInput.trim().toLowerCase();
    if (!v) return;
    if (!/^\S+@\S+\.\S+$/.test(v)) {
      setEmailError("Email inválido");
      return;
    }
    if (authorizedEmails.includes(v)) {
      setEmailError("Email já adicionado");
      return;
    }
    if (v === form.email.trim().toLowerCase() || v === form.masterEmail.trim().toLowerCase()) {
      setEmailError("Já é o email principal ou master");
      return;
    }
    setAuthorizedEmails([...authorizedEmails, v]);
    setEmailInput("");
    setEmailError(null);
  };

  const removeEmail = (target: string) => {
    setAuthorizedEmails(authorizedEmails.filter((e) => e !== target));
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail();
    } else if (e.key === "Backspace" && !emailInput && authorizedEmails.length > 0) {
      removeEmail(authorizedEmails[authorizedEmails.length - 1]!);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      email: form.email,
      masterEmail: form.masterEmail,
      authorizedEmails,
      playbackMode: form.playbackMode as "sequential" | "shuffle",
      jingleMode: form.jingleMode as "ordered" | "interval" | "time",
      jingleInterval: parseInt(form.jingleInterval),
      jingleIntervalSeconds: parseInt(form.jingleIntervalSeconds),
    };
    if (client) {
      update.mutate({ clientId: client.id, data: payload });
    } else {
      create.mutate({ data: { ...payload, password: form.password } });
    }
  };

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Nome</Label><Input data-testid="input-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div>
            <Label>Email de Login (admin do cliente)</Label>
            <Input data-testid="input-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <p className="text-[11px] text-muted-foreground mt-1">Devices que entrarem com este email vão para aprovação manual.</p>
          </div>
          <div>
            <Label>Email Master (auto-aprovação)</Label>
            <Input data-testid="input-master-email" type="email" value={form.masterEmail} onChange={(e) => setForm({ ...form, masterEmail: e.target.value })} required />
            <p className="text-[11px] text-muted-foreground mt-1">Devices com este email são aprovados automaticamente.</p>
          </div>

          <div>
            <Label className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5" /> Emails Autorizados ({authorizedEmails.length})
            </Label>
            <div
              data-testid="authorized-emails-list"
              className="mt-1 flex flex-wrap gap-1.5 p-2 min-h-[42px] rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring"
            >
              {authorizedEmails.map((mail) => (
                <span
                  key={mail}
                  data-testid={`authorized-email-${mail}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-xs"
                >
                  {mail}
                  <button
                    type="button"
                    aria-label={`Remover ${mail}`}
                    data-testid={`button-remove-email-${mail}`}
                    onClick={() => removeEmail(mail)}
                    className="hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                data-testid="input-authorized-email"
                type="email"
                value={emailInput}
                onChange={(e) => { setEmailInput(e.target.value); setEmailError(null); }}
                onKeyDown={handleEmailKeyDown}
                onBlur={() => emailInput.trim() && addEmail()}
                placeholder={authorizedEmails.length === 0 ? "email@dominio.com (Enter para adicionar)" : "+ adicionar"}
                className="flex-1 min-w-[140px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            {emailError ? (
              <p className="text-[11px] text-destructive mt-1">{emailError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">
                Cada email aqui também é auto-aprovado. Use Enter ou vírgula para adicionar.
              </p>
            )}
          </div>

          {!client && (
            <div>
              <Label>Senha</Label>
              <div className="relative">
                <Input
                  data-testid="input-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!client}
                  className="pr-10"
                />
                <button
                  type="button"
                  data-testid="button-toggle-password"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Modo de Reprodução</Label>
              <Select value={form.playbackMode} onValueChange={(v) => setForm({ ...form, playbackMode: v })}>
                <SelectTrigger data-testid="select-playback-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequencial</SelectItem>
                  <SelectItem value="shuffle">Aleatório</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modo Locução</Label>
              <Select value={form.jingleMode} onValueChange={(v) => setForm({ ...form, jingleMode: v })}>
                <SelectTrigger data-testid="select-jingle-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ordered">Ordenado</SelectItem>
                  <SelectItem value="interval">Por musicas (N musicas)</SelectItem>
                  <SelectItem value="time">Por tempo (N minutos)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.jingleMode === "interval" && (
            <div><Label>A cada N musicas</Label><Input data-testid="input-jingle-interval" type="number" min={1} value={form.jingleInterval} onChange={(e) => setForm({ ...form, jingleInterval: e.target.value })} /></div>
          )}
          {form.jingleMode === "time" && (
            <div>
              <Label>A cada (HH:MM:SS) — interrompe a música</Label>
              <Input
                data-testid="input-jingle-interval-time"
                type="text"
                inputMode="numeric"
                placeholder="00:15:00"
                value={secondsToHms(parseInt(form.jingleIntervalSeconds) || 0)}
                onChange={(e) => setForm({ ...form, jingleIntervalSeconds: String(hmsToSeconds(e.target.value)) })}
              />
              <p className="text-xs text-muted-foreground mt-1">Ex: 00:00:50 = 50 segundos · 00:15:00 = 15 minutos</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button data-testid="button-submit" type="submit" disabled={busy}>{busy ? "Salvando..." : client ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  const { data: clients, isLoading } = useListClients({ query: { queryKey: getListClientsQueryKey() } });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<{ open: boolean; client?: Client }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const del = useDeleteClient({ mutation: { onSuccess: () => { toast({ title: "Cliente removido" }); qc.invalidateQueries({ queryKey: getListClientsQueryKey() }); setDeleteTarget(null); }, onError: () => toast({ title: "Erro ao remover", variant: "destructive" }) } });

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">{clients?.length ?? 0} clientes cadastrados</p>
        </div>
        <Button data-testid="button-new-client" onClick={() => setModal({ open: true })}>
          <Plus className="w-4 h-4 mr-2" /> Novo Cliente
        </Button>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-card-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Dispositivos</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Mídias</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide" title="Emails autorizados (master + adicionais)">Emails Autorizados</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Modo</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && [...Array(4)].map((_, i) => (
              <tr key={i}><td colSpan={8} className="px-5 py-4"><div className="h-4 bg-muted animate-pulse rounded" /></td></tr>
            ))}
            {clients?.map((c) => {
              const totalAuthorized = 1 + ((c as Client).authorizedEmails?.length ?? 0); // master + extras
              return (
              <tr key={c.id} data-testid={`row-client-${c.id}`} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-4 font-medium text-foreground">{c.name}</td>
                <td className="px-5 py-4 text-muted-foreground">{c.email}</td>
                <td className="px-5 py-4 text-center">
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><Monitor className="w-3 h-3" />{c.deviceCount ?? 0}</span>
                </td>
                <td className="px-5 py-4 text-center">
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="w-3 h-3" />{c.mediaCount ?? 0}</span>
                </td>
                <td className="px-5 py-4 text-center">
                  <span
                    title={[c.masterEmail, ...((c as Client).authorizedEmails ?? [])].join(", ")}
                    className="inline-flex items-center gap-1 text-muted-foreground"
                  >
                    <Mail className="w-3 h-3" />{totalAuthorized}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium capitalize">{c.playbackMode}</span>
                </td>
                <td className="px-5 py-4 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{c.active ? "Ativo" : "Inativo"}</span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Editar cliente"
                      data-testid={`button-edit-client-${c.id}`}
                      onClick={() => setModal({ open: true, client: c as Client })}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Excluir cliente"
                      data-testid={`button-delete-client-${c.id}`}
                      onClick={() => setDeleteTarget(c as Client)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Link href={`/clients/${c.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Ver detalhes"
                        data-testid={`link-client-${c.id}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </td>
              </tr>
            );
            })}
            {!isLoading && !clients?.length && (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">Nenhum cliente cadastrado</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Re-mount modal whenever target client changes so form re-initializes
          with fresh values (or empty for "new client"). Without the key, useState
          inside ClientModal would keep stale data from the first render. */}
      {modal.open && (
        <ClientModal
          key={modal.client?.id ?? "new"}
          open={modal.open}
          onClose={() => setModal({ open: false })}
          client={modal.client}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir cliente?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Isso removerá o cliente <strong>{deleteTarget?.name}</strong> e todos os seus dados permanentemente.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button data-testid="button-confirm-delete" variant="destructive" onClick={() => deleteTarget && del.mutate({ clientId: deleteTarget.id })} disabled={del.isPending}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
