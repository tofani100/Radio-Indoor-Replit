import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, ChevronRight, Users, Monitor, Eye, EyeOff, X, Mail, ListMusic, Music } from "lucide-react";
import {
  useListClients, getListClientsQueryKey,
  useCreateClient, useUpdateClient, useDeleteClient,
  getGetDashboardSummaryQueryKey, getListPlaylistsQueryKey,
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
  playbackMode: string; jingleMode: string; jingleInterval?: number; jingleCount?: number; voiceoverCount?: number; jingleIntervalSeconds?: number;
  active: boolean; deviceCount?: number; mediaCount?: number; createdAt: string;
};

function getClientEmails(client?: Client): string[] {
  if (!client) return [];
  const set = new Set<string>();
  if (client.authorizedEmails) {
    client.authorizedEmails.forEach((e) => e && set.add(e.trim().toLowerCase()));
  }
  if (client.masterEmail && !client.masterEmail.includes("@cliente.radioindoor.com")) {
    set.add(client.masterEmail.trim().toLowerCase());
  }
  if (client.email && !client.email.includes("@cliente.radioindoor.com")) {
    set.add(client.email.trim().toLowerCase());
  }
  return Array.from(set);
}

function ClientModal({ open, onClose, client }: { open: boolean; onClose: () => void; client?: Client }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: client?.name ?? "",
    playbackMode: client?.playbackMode ?? "sequential",
    jingleMode: client?.jingleMode ?? "interval",
    jingleInterval: String(client?.jingleInterval ?? 3),
    jingleCount: String(client?.jingleCount ?? 1),
    voiceoverCount: String(client?.voiceoverCount ?? 1),
    jingleIntervalSeconds: String(client?.jingleIntervalSeconds ?? 900),
  });
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>(() => getClientEmails(client));
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
    onClose();
  };

  const create = useCreateClient({
    mutation: {
      onSuccess: () => {
        toast({ title: "Cliente criado com sucesso", description: "Playlist principal gerada automaticamente." });
        invalidate();
      },
      onError: (err: any) => {
        const msg = err?.data?.message || err?.message || "Erro ao criar cliente";
        toast({ title: "Erro ao criar cliente", description: msg, variant: "destructive" });
      },
    },
  });

  const update = useUpdateClient({
    mutation: {
      onSuccess: () => {
        toast({ title: "Cliente atualizado com sucesso" });
        invalidate();
      },
      onError: (err: any) => {
        const msg = err?.data?.message || err?.message || "Erro ao atualizar";
        toast({ title: "Erro ao atualizar", description: msg, variant: "destructive" });
      },
    },
  });

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
    if (emailInput.trim()) {
      addEmail();
    }

    const payload = {
      name: form.name.trim(),
      email: authorizedEmails[0] || undefined,
      masterEmail: authorizedEmails[0] || undefined,
      authorizedEmails,
      playbackMode: form.playbackMode as "sequential" | "shuffle",
      jingleMode: form.jingleMode as "ordered" | "interval" | "time",
      jingleInterval: parseInt(form.jingleInterval) || 3,
      jingleCount: parseInt(form.jingleCount) || 1,
      voiceoverCount: parseInt(form.voiceoverCount) || 1,
      jingleIntervalSeconds: parseInt(form.jingleIntervalSeconds) || 900,
    };

    if (client) {
      update.mutate({ clientId: client.id, data: payload });
    } else {
      create.mutate({ data: payload });
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
          <div>
            <Label>Nome do Cliente</Label>
            <Input
              data-testid="input-name"
              placeholder="Ex: Pefisa, Pernambucanas..."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-primary" /> E-mails com Acesso ao Player ({authorizedEmails.length})
              </span>
            </Label>
            <div
              data-testid="authorized-emails-list"
              className="mt-1 flex flex-wrap gap-1.5 p-2 min-h-[46px] rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring"
            >
              {authorizedEmails.map((mail) => (
                <span
                  key={mail}
                  data-testid={`authorized-email-${mail}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium"
                >
                  {mail}
                  <button
                    type="button"
                    aria-label={`Remover ${mail}`}
                    data-testid={`button-remove-email-${mail}`}
                    onClick={() => removeEmail(mail)}
                    className="hover:text-destructive transition-colors ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="flex-1 flex items-center min-w-[160px] gap-1">
                <input
                  data-testid="input-authorized-email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setEmailError(null); }}
                  onKeyDown={handleEmailKeyDown}
                  onBlur={() => emailInput.trim() && addEmail()}
                  placeholder={authorizedEmails.length === 0 ? "Digite o email e tecle Enter..." : "+ adicionar outro email"}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
                {emailInput.trim() && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-primary font-semibold"
                    onClick={addEmail}
                  >
                    Adicionar
                  </Button>
                )}
              </div>
            </div>
            {emailError ? (
              <p className="text-[11px] text-destructive mt-1">{emailError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">
                Qualquer pessoa que digitar um destes e-mails no Player terá acesso imediato às playlists deste cliente.
              </p>
            )}
          </div>

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
              <Label>Modo de Programação</Label>
              <Select value={form.jingleMode} onValueChange={(v) => setForm({ ...form, jingleMode: v })}>
                <SelectTrigger data-testid="select-jingle-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">Por músicas (Intercalado)</SelectItem>
                  <SelectItem value="time">Por tempo (N minutos)</SelectItem>
                  <SelectItem value="ordered">Ordenado (conforme playlist)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.jingleMode === "interval" && (
            <div className="p-3.5 bg-muted/40 border border-border rounded-lg space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">A cada N músicas</Label>
                  <Input
                    data-testid="input-jingle-interval"
                    type="number"
                    min={1}
                    value={form.jingleInterval}
                    onChange={(e) => setForm({ ...form, jingleInterval: e.target.value })}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-amber-600">Tocar Jingles</Label>
                  <Input
                    data-testid="input-jingle-count"
                    type="number"
                    min={0}
                    value={form.jingleCount}
                    onChange={(e) => setForm({ ...form, jingleCount: e.target.value })}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-purple-600">Tocar Locuções</Label>
                  <Input
                    data-testid="input-voiceover-count"
                    type="number"
                    min={0}
                    value={form.voiceoverCount}
                    onChange={(e) => setForm({ ...form, voiceoverCount: e.target.value })}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground bg-background/80 p-2 rounded border border-border/50">
                💡 <strong>Regra:</strong> A cada <strong>{form.jingleInterval || 1} música(s)</strong>, tocará{" "}
                <strong>{form.jingleCount || 0} jingle(s)</strong> e <strong>{form.voiceoverCount || 0} locução(ões)</strong> (caso existam na playlist).
              </div>
            </div>
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
            <Button data-testid="button-submit" type="submit" disabled={busy}>{busy ? "Salvando..." : client ? "Salvar" : "Criar Cliente"}</Button>
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
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">E-mails Autorizados</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Dispositivos</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Mídias</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Modo</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && [...Array(4)].map((_, i) => (
              <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-muted animate-pulse rounded" /></td></tr>
            ))}
            {Array.isArray(clients) && clients.map((c) => {
              const allEmails = getClientEmails(c as Client);
              return (
              <tr key={c.id} data-testid={`row-client-${c.id}`} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-4 font-medium text-foreground">{c.name}</td>
                <td className="px-5 py-4">
                  {allEmails.length > 0 ? (
                    <div className="flex flex-wrap gap-1 items-center max-w-sm">
                      {allEmails.slice(0, 3).map((em) => (
                        <span key={em} className="text-xs px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                          {em}
                        </span>
                      ))}
                      {allEmails.length > 3 && (
                        <span title={allEmails.slice(3).join(", ")} className="text-xs text-muted-foreground px-1 font-medium">
                          +{allEmails.length - 3} mais
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Nenhum e-mail adicionado</span>
                  )}
                </td>
                <td className="px-5 py-4 text-center">
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><Monitor className="w-3 h-3" />{c.deviceCount ?? 0}</span>
                </td>
                <td className="px-5 py-4 text-center">
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="w-3 h-3" />{c.mediaCount ?? 0}</span>
                </td>
                <td className="px-5 py-4">
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium capitalize">{c.playbackMode}</span>
                </td>
                <td className="px-5 py-4 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{c.active ? "Ativo" : "Inativo"}</span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1 justify-end">
                    <Link href={`/playlists?clientId=${c.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Ver playlists deste cliente"
                        data-testid={`link-client-playlists-${c.id}`}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ListMusic className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href={`/media?clientId=${c.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Ver mídias deste cliente"
                        data-testid={`link-client-media-${c.id}`}
                        className="text-muted-foreground hover:text-purple-600"
                      >
                        <Music className="w-4 h-4" />
                      </Button>
                    </Link>
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
                  </div>
                </td>
              </tr>
            );
            })}
            {!isLoading && !clients?.length && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Nenhum cliente cadastrado</td></tr>
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
