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

type ClientUnit = { name: string; email: string };

type Client = {
  id: number; name: string; email: string; masterEmail: string;
  authorizedEmails?: string[];
  plan?: "standard" | "master" | "custom";
  units?: ClientUnit[];
  allowedGlobalPlaylistIds?: number[];
  playbackMode: string; jingleMode: string; jingleInterval?: number; jingleCount?: number; voiceoverCount?: number; jingleIntervalSeconds?: number;
  active: boolean; deviceCount?: number; mediaCount?: number; playlistCount?: number; createdAt: string;
};

function getClientEmails(client?: Client): string[] {
  if (!client) return [];
  const set = new Set<string>();
  if (client.units && Array.isArray(client.units)) {
    client.units.forEach((u) => u?.email && set.add(u.email.trim().toLowerCase()));
  }
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
    plan: client?.plan ?? "standard",
    playbackMode: client?.playbackMode ?? "sequential",
    jingleMode: client?.jingleMode ?? "interval",
    jingleInterval: String(client?.jingleInterval ?? 3),
    jingleCount: String(client?.jingleCount ?? 1),
    voiceoverCount: String(client?.voiceoverCount ?? 1),
    jingleIntervalSeconds: String(client?.jingleIntervalSeconds ?? 900),
  });

  const [units, setUnits] = useState<ClientUnit[]>(() => {
    if (client?.units && client.units.length > 0) return client.units;
    const emails = getClientEmails(client);
    return emails.map((em, idx) => ({
      name: `Unidade ${idx + 1}`,
      email: em,
    }));
  });

  const [unitNameInput, setUnitNameInput] = useState("");
  const [unitEmailInput, setUnitEmailInput] = useState("");
  const [unitError, setUnitError] = useState<string | null>(null);
  const [showBatchEmails, setShowBatchEmails] = useState(false);
  const [batchEmailInput, setBatchEmailInput] = useState("");

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

  const busy = create.isPending || update.isPending;

  const parseEmailTokens = (text: string): string[] => {
    return text
      .split(/[\r\n,;\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
  };

  const addUnit = () => {
    const rawEmail = unitEmailInput.trim().toLowerCase();
    const rawName = unitNameInput.trim() || `Unidade ${units.length + 1}`;

    if (!rawEmail) {
      setUnitError("Informe o e-mail da unidade/filial");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(rawEmail)) {
      setUnitError("E-mail com formato inválido");
      return;
    }
    if (units.some((u) => u.email.toLowerCase() === rawEmail)) {
      setUnitError("Esta unidade com este e-mail já está cadastrada");
      return;
    }

    setUnits([...units, { name: rawName, email: rawEmail }]);
    setUnitNameInput("");
    setUnitEmailInput("");
    setUnitError(null);
  };

  const removeUnit = (targetEmail: string) => {
    setUnits(units.filter((u) => u.email.toLowerCase() !== targetEmail.toLowerCase()));
  };

  const addBatchEmails = () => {
    const tokens = parseEmailTokens(batchEmailInput);
    if (tokens.length === 0) return;

    const existingEmails = new Set(units.map((u) => u.email.toLowerCase()));
    const newUnits: ClientUnit[] = [];
    tokens.forEach((t) => {
      if (/^\S+@\S+\.\S+$/.test(t) && !existingEmails.has(t)) {
        existingEmails.add(t);
        const prefix = t.split("@")[0] || `Loja`;
        const cleanName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
        newUnits.push({ name: `Loja ${cleanName}`, email: t });
      }
    });

    if (newUnits.length > 0) {
      setUnits([...units, ...newUnits]);
      setBatchEmailInput("");
      setShowBatchEmails(false);
      setUnitError(null);
    } else {
      setUnitError("Nenhum e-mail novo válido encontrado.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const authorizedEmails = units.map((u) => u.email.toLowerCase());

    const payload = {
      name: form.name.trim(),
      plan: form.plan as "standard" | "master" | "custom",
      units,
      authorizedEmails,
      email: authorizedEmails[0] || undefined,
      masterEmail: authorizedEmails[0] || undefined,
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome da Empresa / Rede</Label>
            <Input
              data-testid="input-name"
              placeholder="Ex: Supermercados Estrela, Pefisa..."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          {/* Plano do Cliente */}
          <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-2">
            <Label className="font-semibold text-xs text-foreground uppercase tracking-wide">
              Plano do Cliente & Acervo Geral
            </Label>
            <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v as "standard" | "master" | "custom" })}>
              <SelectTrigger data-testid="select-client-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Plano Standard (Até 10 Playlists do Acervo Geral)</SelectItem>
                <SelectItem value="master">Plano Master (Até 30 Playlists do Acervo Geral)</SelectItem>
                <SelectItem value="custom">Plano Personalizado (Seleção customizada)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {form.plan === "master"
                ? "O cliente tem acesso expandido ao acervo com até 30 playlists globais de música."
                : form.plan === "custom"
                ? "Permite liberar playlists específicas personalizadas do acervo para o cliente."
                : "Acesso básico ao acervo com até 10 playlists globais recomendadas."}
            </p>
          </div>

          {/* Gestão Estruturada de Unidades / Filiais */}
          <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-xs text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-primary" /> Unidades / Filiais & Terminais ({units.length})
              </Label>
              <button
                type="button"
                onClick={() => setShowBatchEmails(!showBatchEmails)}
                className="text-xs text-primary hover:underline"
              >
                {showBatchEmails ? "Fechar colagem rápida" : "Colar múltiplos e-mails"}
              </button>
            </div>

            {showBatchEmails ? (
              <div className="space-y-2 bg-background p-2.5 rounded border border-border">
                <p className="text-[11px] text-muted-foreground">
                  Cole uma lista de e-mails de lojas (separados por linhas, vírgulas ou espaços):
                </p>
                <textarea
                  rows={3}
                  value={batchEmailInput}
                  onChange={(e) => setBatchEmailInput(e.target.value)}
                  placeholder="loja1@mercado.com&#10;loja2@mercado.com&#10;shopping@mercado.com"
                  className="w-full text-xs p-2 rounded border border-input bg-transparent font-mono outline-none"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowBatchEmails(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={addBatchEmails}>
                    Importar E-mails
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-6">
                  <Input
                    placeholder="Nome da Filial (ex: Loja 01 - Shopping)"
                    value={unitNameInput}
                    onChange={(e) => setUnitNameInput(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="sm:col-span-4">
                  <Input
                    placeholder="E-mail de acesso"
                    type="email"
                    value={unitEmailInput}
                    onChange={(e) => setUnitEmailInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUnit())}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="button" size="sm" className="h-8 w-full text-xs" onClick={addUnit}>
                    + Loja
                  </Button>
                </div>
              </div>
            )}

            {unitError && <p className="text-[11px] text-destructive">{unitError}</p>}

            {/* Lista de Unidades */}
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {units.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-1">
                  Nenhuma unidade cadastrada. Adicione pelo menos um e-mail de terminal para login no Player.
                </p>
              ) : (
                units.map((u) => (
                  <div
                    key={u.email}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-background border border-border text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-foreground mr-2">{u.name}</span>
                      <span className="font-mono text-muted-foreground text-[11px]">({u.email})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeUnit(u.email)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Remover filial"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
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
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-card-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Plano</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Filiais / Terminais</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Dispositivos</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Mídias</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Modo</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && [...Array(4)].map((_, i) => (
              <tr key={i}><td colSpan={8} className="px-5 py-4"><div className="h-4 bg-muted animate-pulse rounded" /></td></tr>
            ))}
            {Array.isArray(clients) && clients.map((c) => {
              const allEmails = getClientEmails(c as Client);
              const clientUnits: ClientUnit[] = (c as any).units && (c as any).units.length > 0
                ? (c as any).units
                : allEmails.map((em, idx) => ({ name: `Loja ${idx + 1}`, email: em }));
              const plan = (c as any).plan || "standard";

              return (
              <tr key={c.id} data-testid={`row-client-${c.id}`} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-4 font-medium text-foreground">
                  <div>{c.name}</div>
                  <span className="text-[11px] text-muted-foreground">{(c as any).playlistCount ?? 0} playlists exclusivas</span>
                </td>
                <td className="px-5 py-4">
                  {plan === "master" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-600 border border-purple-500/30">
                      Master (30 Globais)
                    </span>
                  ) : plan === "custom" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-600 border border-blue-500/30">
                      Personalizado
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                      Standard (10 Globais)
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  {clientUnits.length > 0 ? (
                    <div className="flex flex-wrap gap-1 items-center max-w-sm">
                      {clientUnits.slice(0, 2).map((u) => (
                        <span key={u.email} className="text-xs px-2 py-0.5 rounded bg-muted text-foreground border border-border" title={u.email}>
                          <strong>{u.name}</strong> <span className="text-[10px] text-muted-foreground">({u.email.split("@")[0]})</span>
                        </span>
                      ))}
                      {clientUnits.length > 2 && (
                        <span title={clientUnits.slice(2).map((u) => `${u.name} (${u.email})`).join(", ")} className="text-xs text-muted-foreground px-1 font-medium">
                          +{clientUnits.length - 2} mais
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Nenhuma filial cadastrada</span>
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
