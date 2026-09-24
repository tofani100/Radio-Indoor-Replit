import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, GripVertical, Plus, Trash2, Music, Mic, ToggleLeft, ToggleRight, Search, CheckSquare, Square, Loader2, Settings2, Eye, EyeOff, Upload, CheckCircle2, XCircle, Building2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useGetPlaylist, getGetPlaylistQueryKey,
  useReorderPlaylistItems, useRemovePlaylistItem, useAddPlaylistItemsBatch, useUpdatePlaylist,
  useListMedia, getListMediaQueryKey,
  useListClients, getListClientsQueryKey, useUpdateClient,
  handleStandaloneRequest,
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

function SortableItem({
  item,
  index,
  onRemove,
  onToggleActive,
}: {
  item: any;
  index: number;
  onRemove: () => void;
  onToggleActive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const isBlocked = item.active === false;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };

  const badgeConfig =
    item.media?.type === "jingle"
      ? { label: "Jingle", bg: isBlocked ? "bg-muted text-muted-foreground/50" : "bg-amber-500/10 text-amber-600", icon: <Mic className="w-3 h-3" /> }
      : item.media?.type === "voiceover"
      ? { label: "Locução", bg: isBlocked ? "bg-muted text-muted-foreground/50" : "bg-purple-500/10 text-purple-600", icon: <Mic className="w-3 h-3" /> }
      : { label: "Música", bg: isBlocked ? "bg-muted text-muted-foreground/50" : "bg-blue-500/10 text-blue-600", icon: <Music className="w-3 h-3" /> };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`playlist-item-${item.id}`}
      className={cn(
        "flex items-center gap-3 px-4 py-3 bg-card border rounded-lg transition-colors select-none",
        isBlocked ? "border-card-border/60 bg-muted/40 opacity-60" : "border-card-border",
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
      <div className={cn("w-6 h-6 rounded flex items-center justify-center flex-none", badgeConfig.bg)}>
        {badgeConfig.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-medium truncate", isBlocked ? "line-through text-muted-foreground" : "text-foreground")}>
            {item.media?.title ?? "–"}
          </p>
          {isBlocked && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/20">
              Oculto / Bloqueado
            </span>
          )}
        </div>
        {item.media?.artist && <p className="text-xs text-muted-foreground">{item.media.artist}</p>}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          data-testid={`button-toggle-item-${item.id}`}
          className={cn(
            "h-8 px-2 text-xs font-medium transition-colors",
            isBlocked
              ? "text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title={isBlocked ? "Desbloquear / Ativar na reprodução" : "Bloquear / Ocultar da reprodução"}
        >
          {isBlocked ? (
            <>
              <EyeOff className="w-4 h-4 mr-1 text-amber-600" />
              <span className="hidden sm:inline">Bloqueado</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 mr-1 text-emerald-600" />
              <span className="hidden sm:inline text-emerald-600">Ativo</span>
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          data-testid={`button-remove-item-${item.id}`}
          className="text-muted-foreground hover:text-destructive h-8 px-2"
          title="Remover definitivamente da playlist"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
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
  const [typeFilter, setTypeFilter] = useState<"all" | "music" | "jingle" | "voiceover">("all");
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
    jingleCount: "1",
    voiceoverCount: "1",
    jingleIntervalSeconds: "900",
  });

  const [directUploadOpen, setDirectUploadOpen] = useState(false);
  const [uploadAudioType, setUploadAudioType] = useState<"jingle" | "voiceover">("jingle");
  const [directUploadItems, setDirectUploadItems] = useState<{ file: File; title: string; progress: number; status: string }[]>([]);
  const [isDirectUploading, setIsDirectUploading] = useState(false);
  const directFileInputRef = useRef<HTMLInputElement>(null);

  const { data: playlist, isLoading } = useGetPlaylist(playlistId, { query: { queryKey: getGetPlaylistQueryKey(playlistId) } });
  const [localItems, setLocalItems] = useState<any[]>([]);

  useEffect(() => {
    if (playlist?.items) {
      setLocalItems(playlist.items);
    }
  }, [playlist?.items]);

  const isGlobalPl = (playlist as any)?.isGlobal;
  const mediaParams = isGlobalPl ? {} : (playlist?.clientId ? { clientId: playlist.clientId } : {});
  const { data: allMedia } = useListMedia(mediaParams, { query: { queryKey: getListMediaQueryKey(mediaParams), enabled: !!playlist } });
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
  const remove = useRemovePlaylistItem({
    mutation: {
      onMutate: async ({ itemId }) => {
        // Cancel any outgoing refetches so they don't overwrite optimistic update
        await qc.cancelQueries({ queryKey: getGetPlaylistQueryKey(playlistId) });

        // Snapshot previous playlist data
        const previousPlaylist = qc.getQueryData<any>(getGetPlaylistQueryKey(playlistId));

        // Optimistic UI state update
        setLocalItems((prev) => prev.filter((it) => it.id !== itemId));

        // Optimistic TanStack Query cache update
        qc.setQueryData(getGetPlaylistQueryKey(playlistId), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            items: (old.items || []).filter((it: any) => it.id !== itemId),
          };
        });

        // Also update playlist item count in the playlists list query cache if present
        qc.setQueriesData({ queryKey: ["/api/playlists"] }, (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((p: any) =>
            p.id === playlistId ? { ...p, itemCount: Math.max(0, (p.itemCount || 1) - 1) } : p
          );
        });

        return { previousPlaylist };
      },
      onError: (_err, _vars, context: any) => {
        if (context?.previousPlaylist) {
          qc.setQueryData(getGetPlaylistQueryKey(playlistId), context.previousPlaylist);
          setLocalItems(context.previousPlaylist.items || []);
        }
        toast({ title: "Erro ao remover faixa", variant: "destructive" });
      },
      onSuccess: () => {
        toast({ title: "Faixa removida da playlist" });
      },
      onSettled: () => {
        inv();
        qc.invalidateQueries({ queryKey: ["/api/playlists"] });
      },
    },
  });

  const handleClearAll = async () => {
    if (!confirm("Tem certeza que deseja remover todas as faixas desta playlist?")) return;
    setLocalItems([]);
    qc.setQueryData(getGetPlaylistQueryKey(playlistId), (old: any) => (old ? { ...old, items: [] } : old));
    qc.setQueriesData({ queryKey: ["/api/playlists"] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((p: any) => (p.id === playlistId ? { ...p, itemCount: 0 } : p));
    });
    try {
      await handleStandaloneRequest(`/api/playlists/${playlistId}/items`, "DELETE", null);
      toast({ title: "Todas as faixas foram removidas da playlist" });
      inv();
      qc.invalidateQueries({ queryKey: ["/api/playlists"] });
    } catch {
      inv();
    }
  };

  const handleStartDirectUpload = async () => {
    if (!playlist || directUploadItems.length === 0) return;
    setIsDirectUploading(true);

    for (let i = 0; i < directUploadItems.length; i++) {
      const item = directUploadItems[i]!;
      setDirectUploadItems((prev) =>
        prev.map((u, idx) => (idx === i ? { ...u, status: "uploading", progress: 20 } : u))
      );

      try {
        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("title", item.title);
        fd.append("type", uploadAudioType);
        fd.append("clientId", String(playlist.clientId || 1));
        fd.append("playlistId", String(playlistId));

        await handleStandaloneRequest("/api/media", "POST", fd, (pct) => {
          setDirectUploadItems((prev) =>
            prev.map((u, idx) => (idx === i ? { ...u, progress: pct } : u))
          );
        });

        setDirectUploadItems((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: "done", progress: 100 } : u))
        );
      } catch {
        setDirectUploadItems((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: "error" } : u))
        );
      }
    }

    setIsDirectUploading(false);
    toast({ title: "Comerciais adicionados à playlist com sucesso!" });
    inv();
    qc.invalidateQueries({ queryKey: ["/api/playlists"] });
  };

  const handleToggleItemActive = async (itemId: number, currentActive?: boolean) => {
    const nextActive = currentActive === false ? true : false;
    // Optimistic UI update
    setLocalItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, active: nextActive } : it))
    );
    qc.setQueryData(getGetPlaylistQueryKey(playlistId), (old: any) => {
      if (!old) return old;
      return {
        ...old,
        items: (old.items || []).map((it: any) => (it.id === itemId ? { ...it, active: nextActive } : it)),
      };
    });

    try {
      await handleStandaloneRequest(`/api/playlists/${playlistId}/items/${itemId}`, "PATCH", {
        active: nextActive,
      });
      toast({
        title: nextActive ? "Faixa ativada na playlist" : "Faixa bloqueada / ocultada",
        description: nextActive
          ? "Esta faixa voltará a tocar no Player."
          : "Esta faixa não tocará mais no Player até ser reativada.",
      });
      inv();
    } catch (err) {
      console.warn("Error toggling item status:", err);
      inv();
    }
  };

  const addBatch = useAddPlaylistItemsBatch({
    mutation: {
      onSuccess: (res) => {
        setAddProgress(100);
        toast({ title: `${res.added} ${res.added === 1 ? "faixa adicionada" : "faixas adicionadas"}` });
        inv();
        qc.invalidateQueries({ queryKey: ["/api/playlists"] });
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
    const isGlobalPlaylist = (playlist as any)?.isGlobal;

    return allMedia.filter((m) => {
      if (!isGlobalPlaylist && m.clientId !== playlist.clientId) return false;
      if (isGlobalPlaylist && m.type !== "music") return false;
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
    if (!allMedia || !playlist) return { music: 0, jingle: 0, voiceover: 0 };
    const isGlobalPlaylist = (playlist as any)?.isGlobal;
    const base = allMedia.filter(
      (m) => (isGlobalPlaylist ? m.type === "music" : m.clientId === playlist.clientId) && !existingMediaIds.has(m.id),
    );
    return {
      music: base.filter((m) => m.type === "music").length,
      jingle: base.filter((m) => m.type === "jingle").length,
      voiceover: base.filter((m) => (m.type as string) === "voiceover").length,
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
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setLocation("/playlists")}
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          data-testid="link-back"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para Playlists
        </button>
      </div>

      {/* Hero Header Card */}
      <div className="bg-card border border-card-border rounded-2xl p-5 sm:p-6 mb-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Artwork + Title + Metadata */}
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            {(playlist as any)?.coverUrl ? (
              <img
                src={(playlist as any).coverUrl}
                alt={playlist.name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border shadow-xs flex-none"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-purple-500/10 via-primary/10 to-blue-500/10 border border-card-border flex items-center justify-center text-primary flex-none shadow-xs">
                <Music className="w-8 h-8 sm:w-10 sm:h-10 text-primary/80" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight" data-testid="text-playlist-name">
                  {playlist.name}
                </h1>
                {(playlist as any)?.genre && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold uppercase tracking-wider">
                    {(playlist as any).genre}
                  </span>
                )}
                {(playlist as any)?.isGlobal && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold uppercase tracking-wider">
                    🌐 Acervo Global
                  </span>
                )}
              </div>

              {currentClient && (
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5" data-testid="text-playlist-client">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground/70" />
                  Cliente: <span className="font-semibold text-foreground">{currentClient.name}</span>
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs px-2.5 py-1 rounded-lg bg-muted text-muted-foreground font-medium">
                  {playlist.items?.length ?? 0} faixas
                </span>

                <button
                  type="button"
                  data-testid="button-toggle-mode"
                  onClick={() =>
                    update.mutate({
                      playlistId,
                      data: { playbackMode: playlist.playbackMode === "sequential" ? "shuffle" : "sequential" },
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors font-medium border border-border/50"
                  title="Clique para alternar entre Sequencial e Aleatório"
                >
                  {playlist.playbackMode === "sequential" ? (
                    <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ToggleRight className="w-4 h-4 text-primary" />
                  )}
                  <span>Modo {playlist.playbackMode === "sequential" ? "Sequencial" : "Aleatório"}</span>
                </button>

                {currentClient && (
                  <button
                    type="button"
                    data-testid="button-jingle-config"
                    onClick={() => {
                      setJingleForm({
                        jingleMode: (currentClient.jingleMode as "interval" | "ordered" | "time") ?? "interval",
                        jingleInterval: String(currentClient.jingleInterval ?? 3),
                        jingleCount: String((currentClient as any).jingleCount ?? 1),
                        voiceoverCount: String((currentClient as any).voiceoverCount ?? 1),
                        jingleIntervalSeconds: String(currentClient.jingleIntervalSeconds ?? 900),
                      });
                      setJingleConfigOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 border border-purple-500/20 transition-colors font-medium"
                    title="Configurar intervalo e regras de locuções"
                  >
                    <Mic className="w-3 h-3" />
                    <span>
                      {currentClient.jingleMode === "interval"
                        ? `A cada ${currentClient.jingleInterval ?? 3} mús: ${(currentClient as any).jingleCount ?? 1} jingle, ${(currentClient as any).voiceoverCount ?? 1} loc`
                        : currentClient.jingleMode === "time"
                        ? `Interrompe a cada ${secondsToHms(currentClient.jingleIntervalSeconds ?? 900)}`
                        : "Ordem da playlist"}
                    </span>
                    <Settings2 className="w-3 h-3 opacity-60 ml-0.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Actions Bar */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-4 lg:pt-0 border-t lg:border-t-0 border-card-border/60">
            {localItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                data-testid="button-clear-playlist"
                onClick={handleClearAll}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 text-xs h-9"
                title="Remover todas as faixas desta playlist"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Limpar Faixas
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              data-testid="button-add-item"
              onClick={() => {
                setAddOpen(true);
                setSelected(new Set());
                setSearch("");
                setTypeFilter("all");
                setAddProgress(0);
              }}
              className="gap-1.5 text-xs h-9"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Buscar na Biblioteca</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDirectUploadOpen(true);
                setDirectUploadItems([]);
              }}
              className="gap-1.5 bg-primary hover:bg-primary/90 text-xs h-9 shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>+ Subir Jingle / Locução</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Playlist Items Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Faixas na Programação
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono font-medium">
            {localItems.length}
          </span>
        </div>
        {localItems.length > 1 && (
          <p className="text-xs text-muted-foreground hidden sm:block">
            Arraste pelo ícone <GripVertical className="w-3 h-3 inline text-muted-foreground/60" /> para redefinir a sequência de execução
          </p>
        )}
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
                  onToggleActive={() => handleToggleItemActive(item.id, item.active)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={jingleConfigOpen} onOpenChange={setJingleConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Programação da Playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              ℹ️ Esta programação se aplica ao cliente <strong>{currentClient?.name}</strong>.
            </p>
            <div>
              <Label>Modo de Reprodução</Label>
              <Select
                value={jingleForm.jingleMode}
                onValueChange={(v) => setJingleForm({ ...jingleForm, jingleMode: v as "interval" | "ordered" | "time" })}
              >
                <SelectTrigger data-testid="select-jingle-mode-config"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">Por músicas (Intercalado)</SelectItem>
                  <SelectItem value="time">Por tempo (Interrompe com vinheta/locução)</SelectItem>
                  <SelectItem value="ordered">Ordenado (conforme a ordem da playlist)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {jingleForm.jingleMode === "interval" && (
              <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs font-semibold">A cada N músicas</Label>
                    <Input
                      data-testid="input-jingle-interval-config"
                      type="number"
                      min={1}
                      max={50}
                      value={jingleForm.jingleInterval}
                      onChange={(e) => setJingleForm({ ...jingleForm, jingleInterval: e.target.value })}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-amber-600">Tocar Jingles</Label>
                    <Input
                      data-testid="input-jingle-count-config"
                      type="number"
                      min={0}
                      max={10}
                      value={jingleForm.jingleCount}
                      onChange={(e) => setJingleForm({ ...jingleForm, jingleCount: e.target.value })}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-purple-600">Tocar Locuções</Label>
                    <Input
                      data-testid="input-voiceover-count-config"
                      type="number"
                      min={0}
                      max={10}
                      value={jingleForm.voiceoverCount}
                      onChange={(e) => setJingleForm({ ...jingleForm, voiceoverCount: e.target.value })}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground bg-background/80 p-2 rounded border border-border/50">
                  💡 <strong>Regra:</strong> A cada <strong>{jingleForm.jingleInterval || 1} música(s)</strong>, tocará{" "}
                  <strong>{jingleForm.jingleCount || 0} jingle(s)</strong> e <strong>{jingleForm.voiceoverCount || 0} locução(ões)</strong> (caso existam).
                </div>
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
                const jCount = Math.max(0, parseInt(jingleForm.jingleCount) || 1);
                const vCount = Math.max(0, parseInt(jingleForm.voiceoverCount) || 1);
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
                    jingleCount: jCount,
                    voiceoverCount: vCount,
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
              { key: "all", label: "Todos", count: typeCounts.music + typeCounts.jingle + typeCounts.voiceover, icon: null, color: "" },
              { key: "music", label: "Música", count: typeCounts.music, icon: Music, color: "text-blue-600" },
              { key: "jingle", label: "Jingle", count: typeCounts.jingle, icon: Mic, color: "text-amber-600" },
              { key: "voiceover", label: "Locução", count: typeCounts.voiceover, icon: Mic, color: "text-purple-600" },
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
                  const rowBadge =
                    m.type === "jingle"
                      ? { label: "Jingle", color: "text-amber-600", bg: "bg-amber-500/10 text-amber-600", icon: <Mic className="w-3 h-3" /> }
                      : m.type === "voiceover"
                      ? { label: "Locução", color: "text-purple-600", bg: "bg-purple-500/10 text-purple-600", icon: <Mic className="w-3 h-3" /> }
                      : { label: "Música", color: "text-blue-600", bg: "bg-blue-500/10 text-blue-600", icon: <Music className="w-3 h-3" /> };

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
                      <div className={cn("w-6 h-6 rounded flex items-center justify-center flex-none", rowBadge.bg)}>
                        {rowBadge.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                        {m.artist && <p className="text-xs text-muted-foreground truncate">{m.artist}</p>}
                      </div>
                      <span className={cn("text-[10px] uppercase tracking-wide font-medium", rowBadge.color)}>
                        {rowBadge.label}
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

      {/* Modal Subir Jingle / Locução Direto para esta Playlist */}
      <Dialog open={directUploadOpen} onOpenChange={(o) => { if (!isDirectUploading) setDirectUploadOpen(o); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              <span>Subir Áudios para esta Playlist</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Tipo do Áudio Comercial</Label>
              <Select
                value={uploadAudioType}
                onValueChange={(v) => setUploadAudioType(v as "jingle" | "voiceover")}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jingle">🔔 Jingle (Vinheta cantada/curta)</SelectItem>
                  <SelectItem value="voiceover">🎙️ Locução (Aviso falado / chamada)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <input
              ref={directFileInputRef}
              type="file"
              multiple
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (!files) return;
                const items = Array.from(files).map((f) => ({
                  file: f,
                  title: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim(),
                  progress: 0,
                  status: "queued",
                }));
                setDirectUploadItems(items);
              }}
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => directFileInputRef.current?.click()}
              disabled={isDirectUploading}
              className="w-full py-6 border-dashed border-2 flex flex-col items-center gap-1 hover:bg-muted/40"
            >
              <Mic className="w-6 h-6 text-primary opacity-80" />
              <span className="text-xs font-semibold">Clique para selecionar arquivos de áudio</span>
              <span className="text-[10px] text-muted-foreground">Você pode selecionar múltiplos arquivos ao mesmo tempo</span>
            </Button>

            {directUploadItems.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 border rounded-lg p-2 bg-muted/20">
                {directUploadItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-1.5 rounded bg-card border text-xs">
                    <span className="truncate flex-1 font-medium">{item.title}</span>
                    {item.status === "uploading" && (
                      <span className="text-[10px] text-primary font-mono flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> {item.progress}%
                      </span>
                    )}
                    {item.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {item.status === "error" && <XCircle className="w-3.5 h-3.5 text-destructive" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDirectUploadOpen(false)} disabled={isDirectUploading}>
              Cancelar
            </Button>
            <Button
              onClick={handleStartDirectUpload}
              disabled={isDirectUploading || directUploadItems.length === 0 || directUploadItems.every((u) => u.status === "done")}
            >
              {isDirectUploading ? "Enviando..." : `Enviar ${directUploadItems.length} Arquivo(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
