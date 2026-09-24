import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Plus, ChevronRight, Trash2, ListMusic, Pencil, Building2, MapPin, Mic } from "lucide-react";
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

  const { data: clients } = useListClients({ query: { queryKey: getListClientsQueryKey() } });

  const [clientFilter, setClientFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("clientId") || "";
  });

  useEffect(() => {
    if (!clientFilter && Array.isArray(clients) && clients.length > 0) {
      setClientFilter(String(clients[0]!.id));
    }
  }, [clients, clientFilter]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: number; name: string } | null>(null);
  const [editName, setEditName] = useState("");

  const [form, setForm] = useState({
    name: "",
    clientId: "",
    playbackMode: "sequential",
    targetAllUnits: true,
    selectedUnitEmails: [] as string[],
  });

  const params = clientFilter ? { clientId: parseInt(clientFilter) } : {};

  const { data: playlists, isLoading } = useListPlaylists(params, {
    query: { queryKey: getListPlaylistsQueryKey(params), enabled: !!clientFilter },
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/playlists"] });
    if (clientFilter) {
      qc.invalidateQueries({ queryKey: getListPlaylistsQueryKey({ clientId: parseInt(clientFilter) }) });
    }
  };

  const create = useCreatePlaylist({
    mutation: {
      onSuccess: () => {
        toast({ title: "Playlist de comerciais criada com sucesso" });
        const targetClientId = form.clientId || clientFilter;
        if (targetClientId && targetClientId !== clientFilter) {
          setClientFilter(targetClientId);
        }
        inv();
        setCreateOpen(false);
        setForm({
          name: "",
          clientId: targetClientId || "",
          playbackMode: "sequential",
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
      onSuccess: () => { toast({ title: "Playlist atualizada" }); inv(); setEditTarget(null); },
      onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
    },
  });

  const selectedClientObj = clients?.find((c) => String(c.id) === (form.clientId || clientFilter));
  const clientUnits = selectedClientObj && (selectedClientObj as any).units?.length > 0
    ? (selectedClientObj as any).units as { name: string; email: string }[]
    : (selectedClientObj?.authorizedEmails || []).map((em, idx) => ({ name: `Loja ${idx + 1}`, email: em }));

  const handleCreateSubmit = () => {
    if (!form.name.trim()) return;
    const clientIdNum = parseInt(form.clientId || clientFilter);
    if (isNaN(clientIdNum)) return;

    create.mutate({
      data: {
        name: form.name.trim(),
        clientId: clientIdNum,
        playbackMode: form.playbackMode as "sequential" | "shuffle",
        isGlobal: false,
        unitEmails: form.targetAllUnits ? [] : form.selectedUnitEmails,
      } as any,
    });
  };

  // Only show client commercial playlists
  const clientCommercialPlaylists = (playlists ?? []).filter((p) => !p.isGlobal);

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Mic className="w-6 h-6" />
            </span>
            <span>Playlists de Jingles & Locuções (Comerciais)</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie programações personalizadas de vinhetas, avisos e locuções para cada cliente e suas filiais (ex: <em>Abre Domingo, Não Abre Domingo, Ofertas Especiais</em>).
          </p>
        </div>
        <Button
          data-testid="button-new-playlist"
          onClick={() => {
            setForm({
              name: "",
              clientId: clientFilter || (clients?.[0] ? String(clients[0].id) : ""),
              playbackMode: "sequential",
              targetAllUnits: true,
              selectedUnitEmails: [],
            });
            setCreateOpen(true);
          }}
          className="gap-2 bg-primary hover:bg-primary/90 shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Playlist de Comerciais</span>
        </Button>
      </div>

      {/* Seletor de Cliente */}
      <div className="flex items-center gap-3 mb-6 p-4 rounded-xl bg-card border">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <Label className="text-xs font-semibold whitespace-nowrap">Empresa / Cliente:</Label>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-full" data-testid="select-client-filter">
              <SelectValue placeholder="Selecione um cliente" />
            </SelectTrigger>
            <SelectContent>
              {Array.isArray(clients) && clients.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground ml-auto font-mono">
          {clientCommercialPlaylists.length} playlist(s) de comerciais
        </span>
      </div>

      {/* Banner Explicativo */}
      <div className="mb-6 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 flex-none mt-0.5">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="text-xs space-y-1">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            📢 Como funcionam as Playlists de Comerciais dos Clientes?
          </h3>
          <p className="text-muted-foreground leading-relaxed">
            Aqui você cria programações de locuções e vinhetas específicas da empresa. Por exemplo, você pode criar a playlist <strong>"{selectedClientObj?.name || 'Cliente'} - Abre Domingo"</strong> para filiais de shopping e <strong>"{selectedClientObj?.name || 'Cliente'} - Não Abre Domingo"</strong> para filiais de rua.
          </p>
          <p className="text-purple-700 dark:text-purple-300 font-medium">
            💡 No <strong>Player</strong>, a loja terá disponível as playlists de comerciais exclusivas dela e poderá alternar entre elas, enquanto a trilha sonora musical é tocada de forma contínua!
          </p>
        </div>
      </div>

      {/* Playlists Table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
        <div className="divide-y divide-card-border">
          {isLoading && (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-5 animate-pulse flex items-center justify-between">
                <div className="space-y-2"><div className="h-4 bg-muted rounded w-48" /><div className="h-3 bg-muted rounded w-24" /></div>
                <div className="h-8 bg-muted rounded w-16" />
              </div>
            ))
          )}

          {!isLoading && clientCommercialPlaylists.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Mic className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">Nenhuma playlist de comerciais cadastrada para este cliente</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Clique no botão acima para criar a primeira playlist comercial (ex: "Programação Semanal", "Abre aos Domingos").
              </p>
            </div>
          )}

          {clientCommercialPlaylists.map((p) => {
            const hasSpecificUnits = Array.isArray(p.unitEmails) && p.unitEmails.length > 0;

            return (
              <div
                key={p.id}
                data-testid={`playlist-item-${p.id}`}
                className="p-5 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-none">
                    <Mic className="w-5 h-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/playlists/${p.id}`}>
                        <span className="font-semibold text-foreground hover:text-primary transition-colors text-base cursor-pointer">
                          {p.name}
                        </span>
                      </Link>

                      {hasSpecificUnits ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium bg-purple-500/10 text-purple-700 border border-purple-500/20">
                          <MapPin className="w-3 h-3" />
                          {p.unitEmails!.length} filial(is)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium bg-blue-500/10 text-blue-700 border border-blue-500/20">
                          <Building2 className="w-3 h-3" />
                          Todas as filiais
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <span>{p.itemCount ?? 0} vinheta(s) e locução(ões)</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(p.createdAt), { addSuffix: true, locale: ptBR })}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-none">
                  <Link href={`/playlists/${p.id}`}>
                    <Button variant="outline" size="sm" className="gap-1 text-xs">
                      <span>Gerenciar Jingles & Locuções</span>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditTarget({ id: p.id, name: p.name }); setEditName(p.name); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dialog Nova Playlist Comercial */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-purple-600" />
              <span>Nova Playlist de Comerciais & Locuções</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Cliente *</Label>
              <Select
                value={form.clientId || clientFilter}
                onValueChange={(val) => setForm({ ...form, clientId: val, selectedUnitEmails: [], targetAllUnits: true })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(clients) && clients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Nome da Playlist Comercial *</Label>
              <Input
                placeholder="Ex: Pernambucanas - Abre Domingo, Loja Shopping - Ofertas"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Segmentação de Filiais */}
            {clientUnits.length > 0 && (
              <div className="p-3.5 bg-muted/40 rounded-xl border space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                    Destino das Filiais
                  </Label>
                  <span className="text-[10px] text-muted-foreground">{clientUnits.length} filiais cadastradas</span>
                </div>
                <div className="flex gap-4 text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer font-medium">
                    <input
                      type="radio"
                      name="targetUnitsPl"
                      checked={form.targetAllUnits}
                      onChange={() => setForm({ ...form, targetAllUnits: true })}
                      className="accent-primary"
                    />
                    <span>🏢 Todas as filiais</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium">
                    <input
                      type="radio"
                      name="targetUnitsPl"
                      checked={!form.targetAllUnits}
                      onChange={() => {
                        setForm({
                          ...form,
                          targetAllUnits: false,
                          selectedUnitEmails: form.selectedUnitEmails.length ? form.selectedUnitEmails : clientUnits.map((u) => u.email.toLowerCase()),
                        });
                      }}
                      className="accent-primary"
                    />
                    <span>📍 Filiais selecionadas</span>
                  </label>
                </div>

                {!form.targetAllUnits && (
                  <div className="mt-2 pt-2 border-t space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {clientUnits.map((u) => {
                      const email = u.email.toLowerCase();
                      const isChecked = form.selectedUnitEmails.includes(email);
                      return (
                        <label key={email} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted border cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setForm((prev) => ({
                                ...prev,
                                selectedUnitEmails: isChecked
                                  ? prev.selectedUnitEmails.filter((e) => e !== email)
                                  : [...prev.selectedUnitEmails, email],
                              }));
                            }}
                            className="accent-primary"
                          />
                          <span className="font-medium">{u.name}</span>
                          <span className="text-muted-foreground font-mono text-[10px]">({email})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateSubmit} disabled={create.isPending}>
              {create.isPending ? "Criando..." : "Criar Playlist de Comerciais"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Nome */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renomear Playlist de Comerciais</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label className="text-xs font-semibold">Nome da Playlist</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button
              disabled={update.isPending || !editName.trim()}
              onClick={() => editTarget && update.mutate({ playlistId: editTarget.id, data: { name: editName.trim() } as any })}
            >
              {update.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Playlist de Comerciais?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza de que deseja excluir <strong>{deleteTarget?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={del.isPending}
              onClick={() => deleteTarget && del.mutate({ playlistId: deleteTarget.id })}
            >
              {del.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
