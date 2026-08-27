import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, GripVertical, Plus, Trash2, Music, Mic, ToggleLeft, ToggleRight, Search, CheckSquare, Square, Loader2, Settings2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useGetPlaylist, getGetPlaylistQueryKey,
  useReorderPlaylistItems, useRemovePlaylistItem, useAddPlaylistItemsBatch, useUpdatePlaylist,
  useListMedia, getListMediaQueryKey,
  useListClients, getListClientsQueryKey, useUpdateClient,
} from "@workspace/api-client-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function SortableItem({ item, index, onRemove }: { item: any; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`playlist-item-${item.id}`}
      className={cn(
        "flex items-center gap-3 px-4 py-3 bg-card border border-card-border rounded-lg transition-colors select-none",
        isDragging && "opacity-75 shadow-xl border-primary ring-2 ring-primary/20 bg-muted/90"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted touch-none"
        title="Arrastar para reordenar"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-xs text-muted-foreground/50 font-mono w-5 text-center">{index + 1}</span>
      <div className={cn("w-6 h-6 rounded flex items-center justify-center flex-none", item.media?.type === "music" ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600")}>
        {item.media?.type === "music" ? <Music className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.media?.title ?? "–"}</p>
        {item.media?.artist && <p className="text-xs text-muted-foreground">{item.media.artist}</p>}
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove} data-testid={`button-remove-item-${item.id}`} className="text-muted-foreground hover:text-destructive">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function PlaylistDetailPage() {
  const params = useParams<{ playlistId: string }>();
  const playlistId = parseInt(params.playlistId);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "music" | "jingle">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addProgress, setAddProgress] = useState(0);
  const [jingleConfigOpen, setJingleConfigOpen] = useState(false);
  // helpers HH:MM:SS
  const secondsToHms = (s: number): string => {
    const total = Math.max(0, Math.floor(s));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  };
  const hmsToSeconds = (v: string): number => {
    const parts = v.trim().split(":").map((p) => parseInt(p) || 0);
    if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
    if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
    return parts[0] ?? 0;
  };
  const [jingleForm, setJingleForm] = useState({
    jingleMode: "interval" as "interval" | "ordered" | "time",
    jingleInterval: "3",
    jingleIntervalSeconds: "900",
  });

  const { data: playlist, isLoading } = useGetPlaylist(playlistId, { query: { queryKey: getGetPlaylistQueryKey(playlistId) } });
  const [localItems, setLocalItems] = useState<any[]>([]);

  useEffect(() => {
    if (playlist?.items) {
      setLocalItems(playlist.items);
    }
  }, [playlist?.items]);

  const { data: allMedia } = useListMedia({}, { query: { queryKey: getListMediaQueryKey({}) } });
  const { data: clients } = useListClients({ query: { queryKey: getListClientsQueryKey() } });
  const currentClient = useMemo(
    () => clients?.find((c) => c.id === playlist?.clientId),
    [clients, playlist?.clientId],
  );
  const updateClient = useUpdateClient({
    mutation: {
      onSuccess: () => {
        toast({ title: "Configuração de locuções salva" });
        qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
        setJingleConfigOpen(false);
      },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const inv = () => qc.invalidateQueries({ queryKey: getGetPlaylistQueryKey(playlistId) });

  const reorder = useReorderPlaylistItems({
    mutation: {
      onError: () => {
        toast({ title: "Erro ao reordenar", variant: "destructive" });
        inv();
      },
    },
  });
  const remove = useRemovePlaylistItem({ mutation: { onSuccess: () => { toast({ title: "Faixa removida" }); inv(); }, onError: () => toast({ title: "Erro", variant: "destructive" }) } });
  const addBatch = useAddPlaylistItemsBatch({
    mutation: {
      onSuccess: (res) => {
        setAddProgress(100);
        toast({ title: `${res.added} ${res.added === 1 ? "faixa adicionada" : "faixas adicionadas"}` });
        inv();
        setTimeout(() => {
          setAddOpen(false);
          setSelected(new Set());
          setSearch("");
          setTypeFilter("all");
          setAddProgress(0);
        }, 350);
      },
      onError: () => { setAddProgress(0); toast({ title: "Erro ao adicionar", variant: "destructive" }); },
    },
  });
  const update = useUpdatePlaylist({ mutation: { onSuccess: () => { toast({ title: "Playlist atualizada" }); inv(); }, onError: () => toast({ title: "Erro", variant: "destructive" }) } });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !localItems.length) return;
    const oldIdx = localItems.findIndex((i) => i.id === active.id);
    const newIdx = localItems.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const newOrder = arrayMove(localItems, oldIdx, newIdx).map((item, idx) => ({
      ...item,
      position: idx,
    }));

    // Atualização otimista imediata para fixar a posição visualmente
    setLocalItems(newOrder);
    qc.setQueryData(getGetPlaylistQueryKey(playlistId), (old: any) => {
      if (!old) return old;
      return { ...old, items: newOrder };
    });

    // Salva no backend / banco de dados
    reorder.mutate(
      { playlistId, data: { itemIds: newOrder.map((i) => i.id) } },
      {
        onSuccess: () => {
          toast({ title: "Ordem da playlist salva com sucesso" });
          inv();
        },
        onError: () => {
          toast({ title: "Erro ao salvar ordem", variant: "destructive" });
          inv();
        },
      }
    );
  };

  const existingMediaIds = useMemo(
    () => new Set((playlist?.items ?? []).map((i) => i.mediaId)),
    [playlist?.items],
  );

  const availableMedia = useMemo(() => {
    if (!allMedia || !playlist) return [];
    const term = search.trim().toLowerCase();
    return allMedia.filter((m) => {
      if (m.clientId !== playlist.clientId) return false;
      if (existingMediaIds.has(m.id)) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (!term) return true;
      return (
        m.title.toLowerCase().includes(term) ||
        (m.artist ?? "").toLowerCase().includes(term)
      );
    });
  }, [allMedia, playlist, existingMediaIds, search, typeFilter]);

  const typeCounts = useMemo(() => {
    if (!allMedia || !playlist) return { music: 0, jingle: 0 };
    const base = allMedia.filter(
      (m) => m.clientId === playlist.clientId && !existingMediaIds.has(m.id),
    );
    return {
      music: base.filter((m) => m.type === "music").length,
      jingle: base.filter((m) => m.type === "jingle").length,
    };
  }, [allMedia, playlist, existingMediaIds]);

  const allSelected = availableMedia.length > 0 && availableMedia.every((m) => selected.has(m.id));

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(availableMedia.map((m) => m.id)));
    }
  };

  const handleAdd = () => {
    if (selected.size === 0) return;
    setAddProgress(15);
    const tick = setInterval(() => {
      setAddProgress((p) => (p < 85 ? p + Math.max(2, Math.round((90 - p) * 0.12)) : p));
    }, 180);
    addBatch.mutate(
      { playlistId, data: { mediaIds: Array.from(selected) } },
      { onSettled: () => clearInterval(tick) },
    );
  };

  if (isLoading) return <div className="p-8"><div className="h-8 w-64 bg-muted animate-pulse rounded mb-4" /><div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div></div>;
  if (!playlist) return <div className="p-8 text-muted-foreground">Playlist nao encontrada</div>;

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <button onClick={() => setLocation("/playlists")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors" data-testid="link-back">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-playlist-name">{playlist.name}</h1>
          {currentClient && (
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-playlist-client">
              Cliente: <span className="font-medium text-foreground">{currentClient.name}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">{playlist.items?.length ?? 0} faixas · modo {playlist.playbackMode}</p>
          {currentClient && (
            <button
              type="button"
              data-testid="button-jingle-config"
              onClick={() => {
                setJingleForm({
                  jingleMode: (currentClient.jingleMode as "interval" | "ordered" | "time") ?? "interval",
                  jingleInterval: String(currentClient.jingleInterval ?? 3),
                  jingleIntervalSeconds: String(currentClient.jingleIntervalSeconds ?? 900),
                });
                setJingleConfigOpen(true);
              }}
              className="mt-2 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 border border-purple-500/20 transition-colors font-medium"
            >
              <Mic className="w-3 h-3" />
              {currentClient.jingleMode === "interval"
                ? `Locução a cada ${currentClient.jingleInterval ?? 3} música${(currentClient.jingleInterval ?? 3) === 1 ? "" : "s"}`
                : currentClient.jingleMode === "time"
                  ? `Interrompe música a cada ${secondsToHms(currentClient.jingleIntervalSeconds ?? 900)}`
                  : "Locuções na ordem da playlist"}
              <Settings2 className="w-3 h-3 opacity-60" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="button-toggle-mode"
            onClick={() => update.mutate({ playlistId, data: { playbackMode: playlist.playbackMode === "sequential" ? "shuffle" : "sequential" } })}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 transition-colors"
          >
            {playlist.playbackMode === "sequential" ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4 text-primary" />}
            {playlist.playbackMode === "sequential" ? "Sequencial" : "Aleatório"}
          </button>
          <Button data-testid="button-add-item" onClick={() => { setAddOpen(true); setSelected(new Set()); setSearch(""); setTypeFilter("all"); setAddProgress(0); }}>
            <Plus className="w-4 h-4 mr-2" /> Adicionar
          </Button>
        </div>
      </div>

      {!localItems.length ? (
        <div className="bg-card border border-card-border rounded-xl px-5 py-12 text-center text-muted-foreground">
          Nenhuma faixa na playlist. Clique em "Adicionar" para incluir mídias.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {localItems.map((item, idx) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  index={idx}
                  onRemove={() => remove.mutate({ playlistId, itemId: item.id })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={jingleConfigOpen} onOpenChange={setJingleConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Locuções</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              ℹ️ Esta configuração se aplica a <strong>todas as playlists</strong> do cliente <strong>{currentClient?.name}</strong>.
            </p>
            <div>
              <Label>Modo de intercalação</Label>
              <Select
                value={jingleForm.jingleMode}
                onValueChange={(v) => setJingleForm({ ...jingleForm, jingleMode: v as "interval" | "ordered" | "time" })}
              >
                <SelectTrigger data-testid="select-jingle-mode-config"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">Por músicas — a cada N músicas</SelectItem>
                  <SelectItem value="time">Por tempo — a cada HH:MM:SS</SelectItem>
                  <SelectItem value="ordered">Ordenado — na ordem da playlist</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Os modos são exclusivos: ao escolher um, os outros são desativados automaticamente.
              </p>
            </div>
            {jingleForm.jingleMode === "interval" && (
              <div>
                <Label>A cada quantas músicas tocar uma locução?</Label>
                <Input
                  data-testid="input-jingle-interval-config"
                  type="number"
                  min={1}
                  max={50}
                  value={jingleForm.jingleInterval}
                  onChange={(e) => setJingleForm({ ...jingleForm, jingleInterval: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Exemplo: <strong>3</strong> = toca 3 músicas, depois 1 locução, repete.
                </p>
              </div>
            )}
            {jingleForm.jingleMode === "time" && (
              <div>
                <Label>A cada (HH:MM:SS) interromper a música</Label>
                <Input
                  data-testid="input-jingle-interval-time-config"
                  type="text"
                  inputMode="numeric"
                  placeholder="00:15:00"
                  value={secondsToHms(parseInt(jingleForm.jingleIntervalSeconds) || 0)}
                  onChange={(e) => setJingleForm({ ...jingleForm, jingleIntervalSeconds: String(hmsToSeconds(e.target.value)) })}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Ex: <strong>00:00:50</strong> = 50 segundos · <strong>00:15:00</strong> = 15 minutos.
                  Quando o tempo bate, a música é interrompida, toca 1 locução e o player avança pra próxima faixa.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJingleConfigOpen(false)} disabled={updateClient.isPending}>Cancelar</Button>
            <Button
              data-testid="button-save-jingle-config"
              disabled={updateClient.isPending || !currentClient}
              onClick={() => {
                if (!currentClient) return;
                const interval = Math.max(1, parseInt(jingleForm.jingleInterval) || 3);
                const intervalSeconds = Math.max(1, parseInt(jingleForm.jingleIntervalSeconds) || 900);
                updateClient.mutate({
                  clientId: currentClient.id,
                  data: {
                    name: currentClient.name,
                    email: currentClient.email,
                    masterEmail: currentClient.masterEmail,
                    playbackMode: currentClient.playbackMode as "sequential" | "shuffle",
                    jingleMode: jingleForm.jingleMode,
                    jingleInterval: interval,
                    jingleIntervalSeconds: intervalSeconds,
                  },
                });
              }}
            >
              {updateClient.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Adicionar Mídias</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="input-search-media"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título ou artista..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-1.5 -mt-1">
            {([
              { key: "all", label: "Todos", count: typeCounts.music + typeCounts.jingle, icon: null, color: "" },
              { key: "music", label: "Música", count: typeCounts.music, icon: Music, color: "text-blue-600" },
              { key: "jingle", label: "Locução", count: typeCounts.jingle, icon: Mic, color: "text-purple-600" },
            ] as const).map((opt) => {
              const Icon = opt.icon;
              const active = typeFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  data-testid={`filter-type-${opt.key}`}
                  onClick={() => { setTypeFilter(opt.key); setSelected(new Set()); }}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                  )}
                >
                  {Icon && <Icon className={cn("w-3 h-3", active ? "" : opt.color)} />}
                  {opt.label}
                  <span className={cn("text-[10px] tabular-nums", active ? "opacity-80" : "opacity-60")}>({opt.count})</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-y border-border py-2 px-1">
            <button
              data-testid="button-toggle-all"
              type="button"
              onClick={toggleAll}
              disabled={availableMedia.length === 0}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
              {allSelected ? "Desmarcar todas" : "Selecionar todas"}
            </button>
            <span className="text-xs text-muted-foreground">
              {selected.size} de {availableMedia.length} selecionadas
            </span>
          </div>

          <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-0">
            {availableMedia.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {search ? "Nenhuma mídia encontrada" : "Nenhuma mídia disponível para adicionar"}
              </p>
            ) : (
              <div className="space-y-1">
                {availableMedia.map((m) => {
                  const isChecked = selected.has(m.id);
                  return (
                    <label
                      key={m.id}
                      data-testid={`media-row-${m.id}`}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border",
                        isChecked
                          ? "bg-primary/5 border-primary/30"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        data-testid={`checkbox-media-${m.id}`}
                        checked={isChecked}
                        onChange={() => toggleOne(m.id)}
                        className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                      />
                      <div className={cn("w-6 h-6 rounded flex items-center justify-center flex-none", m.type === "music" ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600")}>
                        {m.type === "music" ? <Music className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                        {m.artist && <p className="text-xs text-muted-foreground truncate">{m.artist}</p>}
                      </div>
                      <span className={cn("text-[10px] uppercase tracking-wide font-medium", m.type === "music" ? "text-blue-600" : "text-purple-600")}>
                        {m.type === "music" ? "Música" : "Locução"}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {(addBatch.isPending || addProgress > 0) && (
            <div className="space-y-1.5 px-1" data-testid="add-progress">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-foreground font-medium">
                  {addBatch.isPending && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                  {addBatch.isPending
                    ? `Adicionando ${selected.size} ${selected.size === 1 ? "faixa" : "faixas"}...`
                    : "Concluído!"}
                </span>
                <span className="tabular-nums text-muted-foreground">{addProgress}%</span>
              </div>
              <Progress value={addProgress} className="h-2" />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBatch.isPending}>Cancelar</Button>
            <Button
              data-testid="button-add-selected"
              onClick={handleAdd}
              disabled={selected.size === 0 || addBatch.isPending}
            >
              {addBatch.isPending
                ? "Adicionando..."
                : selected.size === 0
                  ? "Adicionar"
                  : `Adicionar ${selected.size} ${selected.size === 1 ? "faixa" : "faixas"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
