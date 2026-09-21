import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Plus, ChevronRight, Trash2, ListMusic, Pencil, Globe, Building2 } from "lucide-react";
import {
  useListPlaylists, getListPlaylistsQueryKey,
  useCreatePlaylist, useDeletePlaylist, useUpdatePlaylist,
  useListClients, getListClientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PlaylistsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [clientFilter, setClientFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("clientId") || "global";
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: number; name: string } | null>(null);
  const [editName, setEditName] = useState("");

  const [form, setForm] = useState({
    name: "",
    isGlobal: true,
    clientId: "",
    playbackMode: "sequential",
    allowedPlan: "all",
    targetAllUnits: true,
    selectedUnitEmails: [] as string[],
  });

  const { data: clients } = useListClients({ query: { queryKey: getListClientsQueryKey() } });

  // If no client is filtered, default to "global"
  useEffect(() => {
    if (!clientFilter) {
      setClientFilter("global");
    }
  }, [clientFilter]);

  const params = clientFilter === "global"
    ? ({ isGlobal: true } as any)
    : clientFilter
    ? { clientId: parseInt(clientFilter) }
    : {};

  const { data: playlists, isLoading } = useListPlaylists(params, {
    query: { queryKey: getListPlaylistsQueryKey(params), enabled: !!clientFilter },
  });

  const inv = () => qc.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });

  const create = useCreatePlaylist({
    mutation: {
      onSuccess: () => {
        toast({ title: "Playlist criada com sucesso" });
        inv();
        setCreateOpen(false);
        setForm({
          name: "",
          isGlobal: clientFilter === "global",
          clientId: clientFilter !== "global" ? clientFilter : "",
          playbackMode: "sequential",
          allowedPlan: "all",
          targetAllUnits: true,
          selectedUnitEmails: [],
        });
      },
      onError: () => toast({ title: "Erro ao criar playlist", variant: "destructive" }),
    },
  });

  const del = useDeletePlaylist({
    mutation: {
      onSuccess: () => { toast({ title: "Playlist removida" }); inv(); setDeleteTarget(null); },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    },
  });

  const update = useUpdatePlaylist({
    mutation: {
      onSuccess: () => { toast({ title: "Playlist renomeada" }); inv(); setEditTarget(null); },
      onError: () => toast({ title: "Erro ao renomear", variant: "destructive" }),
    },
  });

  const selectedClientObj = clients?.find((c) => String(c.id) === form.clientId);
  const clientUnits = selectedClientObj && (selectedClientObj as any).units?.length > 0
    ? (selectedClientObj as any).units as { name: string; email: string }[]
    : (selectedClientObj?.authorizedEmails || []).map((em, idx) => ({ name: `Loja ${idx + 1}`, email: em }));

  const handleCreateSubmit = () => {
    if (!form.name.trim()) return;
    const clientIdNum = form.isGlobal ? 1 : parseInt(form.clientId);
    if (!form.isGlobal && isNaN(clientIdNum)) return;

    create.mutate({
      data: {
        name: form.name.trim(),
        clientId: clientIdNum,
        playbackMode: form.playbackMode as "sequential" | "shuffle",
        isGlobal: form.isGlobal,
        allowedPlans: form.isGlobal ? (form.allowedPlan === "all" ? ["all"] : [form.allowedPlan]) : undefined,
        unitEmails: form.isGlobal || form.targetAllUnits ? [] : form.selectedUnitEmails,
      } as any,
    });
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Playlists</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {clientFilter === "global" ? "Acervo Geral de Playlists (Músicas Globais)" : "Playlists Exclusivas do Cliente"} · {playlists?.length ?? 0} playlists
          </p>
        </div>
        <Button
          data-testid="button-new-playlist"
          onClick={() => {
            setForm((prev) => ({
              ...prev,
              isGlobal: clientFilter === "global",
              clientId: clientFilter !== "global" ? clientFilter : (clients?.[0] ? String(clients[0].id) : ""),
            }));
            setCreateOpen(true);
          }}
          className={clientFilter === "global" ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}
        >
          <Plus className="w-4 h-4 mr-2" />
          {clientFilter === "global" ? "Criar Playlist no Acervo Geral" : "Nova Playlist para Cliente"}
        </Button>
      </div>

      {/* Tabs de Filtro */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setClientFilter("global")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              clientFilter === "global"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Acervo Geral (Globais)
          </button>
          <button
            type="button"
            onClick={() => {
              if (clientFilter === "global" && clients && clients.length > 0) {
                setClientFilter(String(clients[0]!.id));
              }
            }}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              clientFilter !== "global"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Por Cliente
          </button>
        </div>

        {clientFilter !== "global" && (
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-56" data-testid="select-client-filter">
              <SelectValue placeholder="Selecione um cliente" />
            </SelectTrigger>
            <SelectContent>
              {Array.isArray(clients) && clients.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Banner Informativo Explicando o Funcionamento */}
      {clientFilter === "global" ? (
        <div className="mb-6 p-4 rounded-xl border border-purple-500/30 bg-purple-500/10 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 flex-none mt-0.5">
            <Globe className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-1">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              🌐 O que é o Acervo Geral?
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Aqui você cadastra as <strong>playlists musicais mestras</strong> da sua rádio (ex: <em>Pop Hits, Sertanejo Sucessos, MPB Acústico, Lounge Bar, Rock Clássico</em>).
              Todas as playlists criadas nesta aba ficam <strong>automaticamente disponíveis para todos os seus clientes escolherem no Player</strong> de acordo com o plano contratado (Standard ou Master).
            </p>
            <p className="text-purple-700 dark:text-purple-300 font-medium">
              💡 <strong>Privacidade Comercial Garantida:</strong> Quando um cliente seleciona uma playlist do Acervo Geral, as músicas tocam e o sistema <strong>injeta de forma automática e intercalada apenas as vinhetas e locuções exclusivas da loja dele</strong>!
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 flex-none mt-0.5">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-1">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              🏢 Playlists Exclusivas do Cliente
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Playlists personalizadas criadas especificamente para este cliente ou para filiais específicas da empresa dele.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {isLoading && [...Array(3)].map((_, i) => <div key={i} className="bg-card border border-card-border rounded-xl h-20 animate-pulse" />)}
        {Array.isArray(playlists) && playlists.map((p) => {
          const isGlobal = (p as any).isGlobal === true;
          const unitEmails: string[] = (p as any).unitEmails || [];

          return (
          <div key={p.id} data-testid={`card-playlist-${p.id}`} className="bg-card border border-card-border rounded-xl px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-none ${
              isGlobal ? "bg-purple-500/10 text-purple-600" : "bg-primary/10 text-primary"
            }`}>
              <ListMusic className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground truncate">{p.name}</p>
                {isGlobal ? (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 border border-purple-500/30">
                    Acervo Geral
                  </span>
                ) : unitEmails.length > 0 ? (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 border border-blue-500/30">
                    {unitEmails.length} {unitEmails.length === 1 ? "Filial" : "Filiais"}
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                    Todas as Filiais
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {isGlobal ? "Disponível aos clientes por plano" : ((p as any).clientName ?? "–")} · {p.itemCount ?? 0} faixas · {p.playbackMode === "shuffle" ? "Aleatório" : "Sequencial"}
              </p>
              <div className="flex items-center gap-2 mt-1 sm:hidden">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${p.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{p.active ? "Ativa" : "Inativa"}</span>
                <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(p.createdAt), { addSuffix: true, locale: ptBR })}</span>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${p.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{p.active ? "Ativa" : "Inativa"}</span>
              <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(p.createdAt), { addSuffix: true, locale: ptBR })}</span>
            </div>
            <div className="flex items-center gap-1 flex-none">
              <Button variant="ghost" size="sm" data-testid={`button-edit-playlist-${p.id}`} onClick={() => { setEditTarget({ id: p.id, name: p.name }); setEditName(p.name); }} className="text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></Button>
              <Link href={`/playlists/${p.id}`}><Button variant="ghost" size="sm" data-testid={`link-playlist-${p.id}`}><ChevronRight className="w-4 h-4" /></Button></Link>
              <Button variant="ghost" size="sm" data-testid={`button-delete-playlist-${p.id}`} onClick={() => setDeleteTarget({ id: p.id, name: p.name })} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
        )})}
        {!isLoading && !playlists?.length && (
          <div className="bg-card border border-card-border rounded-xl px-5 py-12 text-center text-muted-foreground">
            {clientFilter === "global"
              ? "Nenhuma playlist no Acervo Geral. Crie uma para disponibilizar aos clientes!"
              : "Nenhuma playlist encontrada para este cliente."}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova Playlist</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo da Playlist</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, isGlobal: true })}
                  className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition-colors ${
                    form.isGlobal
                      ? "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="block font-bold">🌐 Acervo Geral</span>
                  <span className="text-[11px] font-normal text-muted-foreground">Compartilhada via plano</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, isGlobal: false })}
                  className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition-colors ${
                    !form.isGlobal
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="block font-bold">🏢 Exclusiva do Cliente</span>
                  <span className="text-[11px] font-normal text-muted-foreground">Personalizada da rede/filial</span>
                </button>
              </div>
            </div>

            <div>
              <Label>Nome da Playlist</Label>
              <Input
                data-testid="input-name"
                placeholder={form.isGlobal ? "Ex: Pop Hits 2026, Lounge & Café..." : "Ex: Especial Fim de Semana, Loja Matriz..."}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {form.isGlobal ? (
              <div>
                <Label>Plano Mínimo para Acesso</Label>
                <Select value={form.allowedPlan} onValueChange={(v) => setForm({ ...form, allowedPlan: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Planos (Standard & Master)</SelectItem>
                    <SelectItem value="master">Exclusiva Plano Master</SelectItem>
                    <SelectItem value="standard">Disponível Plano Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label>Cliente / Empresa</Label>
                  <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v, selectedUnitEmails: [] })}>
                    <SelectTrigger data-testid="select-client"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                    <SelectContent>
                      {Array.isArray(clients) && clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {clientUnits.length > 1 && (
                  <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-2">
                    <Label className="text-xs font-semibold">Disponibilidade nas Filiais</Label>
                    <div className="space-y-1.5 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="targetUnits"
                          checked={form.targetAllUnits}
                          onChange={() => setForm({ ...form, targetAllUnits: true, selectedUnitEmails: [] })}
                        />
                        <span>Todas as filiais deste cliente</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="targetUnits"
                          checked={!form.targetAllUnits}
                          onChange={() => setForm({ ...form, targetAllUnits: false })}
                        />
                        <span>Apenas filiais selecionadas</span>
                      </label>
                    </div>

                    {!form.targetAllUnits && (
                      <div className="pt-2 pl-4 space-y-1 max-h-32 overflow-y-auto">
                        {clientUnits.map((u) => {
                          const checked = form.selectedUnitEmails.includes(u.email);
                          return (
                            <label key={u.email} className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...form.selectedUnitEmails, u.email]
                                    : form.selectedUnitEmails.filter((em) => em !== u.email);
                                  setForm({ ...form, selectedUnitEmails: next });
                                }}
                              />
                              <span><strong>{u.name}</strong> <span className="text-[10px] text-muted-foreground">({u.email})</span></span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div>
              <Label>Modo Padrão</Label>
              <Select value={form.playbackMode} onValueChange={(v) => setForm({ ...form, playbackMode: v })}>
                <SelectTrigger data-testid="select-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequencial</SelectItem>
                  <SelectItem value="shuffle">Aleatório</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              data-testid="button-submit"
              onClick={handleCreateSubmit}
              disabled={!form.name || (!form.isGlobal && !form.clientId) || create.isPending}
            >
              {create.isPending ? "Criando..." : "Criar Playlist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit / rename dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Renomear Playlist</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Novo nome</Label>
            <Input
              data-testid="input-edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && editName.trim() && editTarget) update.mutate({ playlistId: editTarget.id, data: { name: editName.trim() } }); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button
              data-testid="button-confirm-rename"
              onClick={() => editTarget && update.mutate({ playlistId: editTarget.id, data: { name: editName.trim() } })}
              disabled={!editName.trim() || editName.trim() === editTarget?.name || update.isPending}
            >
              {update.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir playlist?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">A playlist <strong>{deleteTarget?.name}</strong> sera removida permanentemente.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button data-testid="button-confirm-delete" variant="destructive" onClick={() => deleteTarget && del.mutate({ playlistId: deleteTarget.id })} disabled={del.isPending}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
