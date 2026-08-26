import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Plus, ChevronRight, Trash2, ListMusic, Pencil } from "lucide-react";
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
    return params.get("clientId") || "";
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: number; name: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [form, setForm] = useState({ name: "", clientId: "", playbackMode: "sequential" });

  const { data: clients } = useListClients({ query: { queryKey: getListClientsQueryKey() } });

  // If no client is filtered but clients list has items, default to the first client or keep selected
  useEffect(() => {
    if (!clientFilter && Array.isArray(clients) && clients.length > 0) {
      setClientFilter(String(clients[0]!.id));
    }
  }, [clients, clientFilter]);

  const params = clientFilter ? { clientId: parseInt(clientFilter) } : {};
  const { data: playlists, isLoading } = useListPlaylists(params, { query: { queryKey: getListPlaylistsQueryKey(params), enabled: !!clientFilter } });

  const inv = () => qc.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });

  const create = useCreatePlaylist({ mutation: { onSuccess: () => { toast({ title: "Playlist criada" }); inv(); setCreateOpen(false); setForm({ name: "", clientId: "", playbackMode: "sequential" }); }, onError: () => toast({ title: "Erro ao criar", variant: "destructive" }) } });
  const del = useDeletePlaylist({ mutation: { onSuccess: () => { toast({ title: "Playlist removida" }); inv(); setDeleteTarget(null); }, onError: () => toast({ title: "Erro", variant: "destructive" }) } });
  const update = useUpdatePlaylist({ mutation: { onSuccess: () => { toast({ title: "Playlist renomeada" }); inv(); setEditTarget(null); }, onError: () => toast({ title: "Erro ao renomear", variant: "destructive" }) } });

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Playlists</h1>
          <p className="text-sm text-muted-foreground mt-1">{playlists?.length ?? 0} playlists</p>
        </div>
        <Button data-testid="button-new-playlist" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Playlist
        </Button>
      </div>

      <div className="flex gap-3 mb-6">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-48" data-testid="select-client-filter"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
          <SelectContent>
            {Array.isArray(clients) && clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!clientFilter && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center text-muted-foreground mb-6">
          Selecione um cliente acima para ver as playlists.
        </div>
      )}

      <div className="grid gap-3">
        {isLoading && [...Array(3)].map((_, i) => <div key={i} className="bg-card border border-card-border rounded-xl h-20 animate-pulse" />)}
        {Array.isArray(playlists) && playlists.map((p) => (
          <div key={p.id} data-testid={`card-playlist-${p.id}`} className="bg-card border border-card-border rounded-xl px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
              <ListMusic className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{(p as any).clientName ?? "–"} · {p.itemCount ?? 0} faixas · {p.playbackMode}</p>
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
        ))}
        {!isLoading && !playlists?.length && (
          <div className="bg-card border border-card-border rounded-xl px-5 py-12 text-center text-muted-foreground">Nenhuma playlist encontrada</div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nova Playlist</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome</Label><Input data-testid="input-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Cliente</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                <SelectTrigger data-testid="select-client"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>{Array.isArray(clients) && clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modo</Label>
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
            <Button data-testid="button-submit" onClick={() => create.mutate({ data: { name: form.name, clientId: parseInt(form.clientId), playbackMode: form.playbackMode as "sequential" | "shuffle" } })} disabled={!form.name || !form.clientId || create.isPending}>
              {create.isPending ? "Criando..." : "Criar"}
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
