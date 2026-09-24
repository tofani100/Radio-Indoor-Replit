import { useState, useRef, useMemo } from "react";
import {
  Upload, Trash2, Music, CheckCircle2, XCircle, Loader2, ListMusic,
  Plus, Image as ImageIcon, Sparkles, Search, Play, Pause, Pencil, X,
  Users, Check, AlertCircle, EyeOff, Eye, Minimize2, Maximize2
} from "lucide-react";
import {
  useListPlaylists, getListPlaylistsQueryKey,
  useCreatePlaylist, useUpdatePlaylist, useDeletePlaylist,
  useGetPlaylist, getGetPlaylistQueryKey,
  useRemovePlaylistItem,
  useListClients,
  handleStandaloneRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface UploadFileItem {
  file: File;
  title: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
}

const PRESET_COVERS = [
  { genre: "Pop", url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80", label: "Pop Neon" },
  { genre: "Rock", url: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80", label: "Rock Concert" },
  { genre: "Lounge", url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&auto=format&fit=crop&q=80", label: "Lounge Sunset" },
  { genre: "Sertanejo", url: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80", label: "Acústico" },
  { genre: "MPB", url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80", label: "Violão & MPB" },
  { genre: "Jazz", url: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&auto=format&fit=crop&q=80", label: "Jazz Club" },
  { genre: "Eletrônica", url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80", label: "Club & Beats" },
  { genre: "Lo-Fi", url: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80", label: "Chillout Lo-Fi" },
];

export default function MediaPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: clients } = useListClients();
  const [createClientSearch, setCreateClientSearch] = useState("");
  const [editClientSearch, setEditClientSearch] = useState("");

  const [playlistSearch, setPlaylistSearch] = useState("");
  const [playlistGenreFilter, setPlaylistGenreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // ── Create Album Modal ──
  const [createPlOpen, setCreatePlOpen] = useState(false);
  const [plForm, setPlForm] = useState({
    name: "",
    genre: "Pop",
    customGenre: "",
    allowedPlan: "all",
    clientAccessMode: "all" as "all" | "specific" | "inactive",
    selectedClientIds: [] as number[],
    playbackMode: "sequential",
    coverUrl: "",
  });
  const [selectedMusicFiles, setSelectedMusicFiles] = useState<UploadFileItem[]>([]);
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const musicFileInputRef = useRef<HTMLInputElement>(null);

  // ── Album Detail / Studio Dialog ──
  const [activeAlbumId, setActiveAlbumId] = useState<number | null>(null);
  const albumDirectInputRef = useRef<HTMLInputElement>(null);

  // ── Background Upload Sessions (support concurrent minimized uploads) ──
  interface BackgroundUploadSession {
    albumId: number;
    albumName: string;
    coverUrl: string;
    genre: string;
    files: UploadFileItem[];
    isUploading: boolean;
  }
  const [uploadSessions, setUploadSessions] = useState<BackgroundUploadSession[]>([]);

  // ── Edit Album Metadata Modal ──
  const [editPlTarget, setEditPlTarget] = useState<any | null>(null);
  const [deletePlTarget, setDeletePlTarget] = useState<{ id: number; name: string } | null>(null);

  // ── Audio Preview in Album Studio ──
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // ── Query Playlists (Acervo Musical) ──
  const globalPlParams = { isGlobal: true } as any;
  const { data: globalPlaylists, isLoading: plLoading, isFetching: plFetching } = useListPlaylists(globalPlParams, {
    query: { queryKey: getListPlaylistsQueryKey(globalPlParams), staleTime: 5 * 60 * 1000 },
  });

  // Query for the currently open album in the Album Studio dialog
  const { data: activeAlbumData, isLoading: albumLoading } = useGetPlaylist(activeAlbumId ?? 0, {
    query: {
      queryKey: getGetPlaylistQueryKey(activeAlbumId ?? 0),
      enabled: !!activeAlbumId,
    },
  });

  const invalidatePlaylists = () => {
    qc.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
    if (activeAlbumId) {
      qc.invalidateQueries({ queryKey: getGetPlaylistQueryKey(activeAlbumId) });
    }
  };

  // ── Mutations ──
  const createPl = useCreatePlaylist();
  const updatePl = useUpdatePlaylist({
    mutation: {
      onSuccess: () => {
        toast({ title: "Álbum atualizado com sucesso!" });
        invalidatePlaylists();
        setEditPlTarget(null);
      },
      onError: () => toast({ title: "Erro ao atualizar álbum", variant: "destructive" }),
    },
  });

  const delPl = useDeletePlaylist({
    mutation: {
      onSuccess: () => {
        toast({ title: "Álbum removido com sucesso" });
        invalidatePlaylists();
        setDeletePlTarget(null);
        if (activeAlbumId) setActiveAlbumId(null);
      },
      onError: () => toast({ title: "Erro ao remover álbum", variant: "destructive" }),
    },
  });

  const removePlaylistItem = useRemovePlaylistItem({
    mutation: {
      onSuccess: () => {
        toast({ title: "Faixa removida do álbum" });
        invalidatePlaylists();
      },
      onError: () => toast({ title: "Erro ao remover faixa", variant: "destructive" }),
    },
  });

  // ── Cover Upload Function ──
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEditing = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await handleStandaloneRequest("/api/playlists/upload-cover", "POST", fd);
      if (res.data?.url) {
        if (isEditing) {
          setEditPlTarget((prev: any) => ({ ...prev, coverUrl: res.data.url }));
        } else {
          setPlForm((prev) => ({ ...prev, coverUrl: res.data.url }));
        }
        toast({ title: "Capa do álbum carregada com sucesso!" });
      }
    } catch {
      toast({ title: "Falha ao carregar capa", variant: "destructive" });
    } finally {
      setCoverUploading(false);
    }
  };

  // ── Select Music Files for New Album ──
  const handleNewAlbumMusicSelect = (files: FileList | null) => {
    if (!files) return;
    const items: UploadFileItem[] = Array.from(files).map((f) => ({
      file: f,
      title: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim(),
      progress: 0,
      status: "queued",
    }));
    setSelectedMusicFiles((prev) => [...prev, ...items]);
  };

  // ── Create Album with Direct Music Upload ──
  const handleCreateAlbumSubmit = async () => {
    if (!plForm.name.trim()) {
      toast({ title: "Informe o nome do álbum", variant: "destructive" });
      return;
    }

    setIsCreatingAlbum(true);
    const finalGenre = plForm.genre === "custom" ? plForm.customGenre.trim() || "Variado" : plForm.genre;

    try {
      const isActive = plForm.clientAccessMode !== "inactive";
      const clientIds = plForm.clientAccessMode === "all" ? [] : plForm.selectedClientIds;

      // 1. Create playlist
      const res = await handleStandaloneRequest("/api/playlists", "POST", {
        name: plForm.name.trim(),
        clientId: 1,
        isGlobal: true,
        playbackMode: plForm.playbackMode,
        genre: finalGenre,
        coverUrl: plForm.coverUrl.trim() || undefined,
        allowedPlans: plForm.allowedPlan === "all" ? ["all"] : [plForm.allowedPlan],
        allowedClientIds: clientIds,
        active: isActive,
      });

      const newPlaylistId = res.data?.id;
      if (!newPlaylistId) throw new Error("Falha ao obter ID da nova playlist");

      // 2. Upload selected tracks directly into this playlist
      if (selectedMusicFiles.length > 0) {
        for (let i = 0; i < selectedMusicFiles.length; i++) {
          const item = selectedMusicFiles[i]!;
          setSelectedMusicFiles((prev) =>
            prev.map((u, idx) => (idx === i ? { ...u, status: "uploading", progress: 20 } : u))
          );
          try {
            const fd = new FormData();
            fd.append("file", item.file);
            fd.append("title", item.title);
            fd.append("type", "music");
            fd.append("clientId", "1");
            fd.append("playlistId", String(newPlaylistId));

            await handleStandaloneRequest("/api/media", "POST", fd, (pct) => {
              setSelectedMusicFiles((prev) =>
                prev.map((u, idx) => (idx === i ? { ...u, progress: pct } : u))
              );
            });

            setSelectedMusicFiles((prev) =>
              prev.map((u, idx) => (idx === i ? { ...u, status: "done", progress: 100 } : u))
            );
          } catch {
            setSelectedMusicFiles((prev) =>
              prev.map((u, idx) => (idx === i ? { ...u, status: "error" } : u))
            );
          }
        }
      }

      toast({ title: isActive ? "Álbum musical criado com sucesso!" : "Álbum musical criado como Inativo (Standby)!" });
      invalidatePlaylists();
      setCreatePlOpen(false);
      setPlForm({
        name: "",
        genre: "Pop",
        customGenre: "",
        allowedPlan: "all",
        clientAccessMode: "all",
        selectedClientIds: [],
        playbackMode: "sequential",
        coverUrl: "",
      });
      setSelectedMusicFiles([]);
    } catch {
      toast({ title: "Erro ao criar álbum musical", variant: "destructive" });
    } finally {
      setIsCreatingAlbum(false);
    }
  };

  // ── Upload Tracks Directly into an Existing Album ──
  const handleDirectAlbumMusicUpload = async (files: FileList | null, targetAlbumId?: number) => {
    const albumId = targetAlbumId ?? activeAlbumId;
    if (!files || !albumId) return;

    // Get album metadata for the minimized bar
    const albumMeta = (globalPlaylists || []).find((p: any) => p.id === albumId);
    const albumName = albumMeta?.name || `Álbum #${albumId}`;
    const coverUrl = albumMeta?.coverUrl || "";
    const genre = albumMeta?.genre || "";

    const items: UploadFileItem[] = Array.from(files).map((f) => ({
      file: f,
      title: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim(),
      progress: 0,
      status: "queued",
    }));

    // Create or append to the upload session for this album
    setUploadSessions((prev) => {
      const existing = prev.find((s) => s.albumId === albumId);
      if (existing) {
        return prev.map((s) =>
          s.albumId === albumId
            ? { ...s, files: [...s.files, ...items], isUploading: true }
            : s
        );
      }
      return [...prev, { albumId, albumName, coverUrl, genre, files: items, isUploading: true }];
    });

    const updateFile = (idx: number, patch: Partial<UploadFileItem>) => {
      setUploadSessions((prev) =>
        prev.map((s) =>
          s.albumId === albumId
            ? { ...s, files: s.files.map((f, i) => (i === idx ? { ...f, ...patch } : f)) }
            : s
        )
      );
    };

    // Get the starting index (in case we appended to existing session)
    const startIdx = await new Promise<number>((resolve) => {
      setUploadSessions((prev) => {
        const session = prev.find((s) => s.albumId === albumId);
        resolve(session ? session.files.length - items.length : 0);
        return prev;
      });
    });

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const fileIdx = startIdx + i;
      updateFile(fileIdx, { status: "uploading", progress: 20 });

      try {
        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("title", item.title);
        fd.append("type", "music");
        fd.append("clientId", "1");
        fd.append("playlistId", String(albumId));

        await handleStandaloneRequest("/api/media", "POST", fd, (pct) => {
          updateFile(fileIdx, { progress: pct });
        });

        updateFile(fileIdx, { status: "done", progress: 100 });
      } catch {
        updateFile(fileIdx, { status: "error" });
      }
    }

    // Mark session as done
    setUploadSessions((prev) =>
      prev.map((s) =>
        s.albumId === albumId ? { ...s, isUploading: false } : s
      )
    );
    toast({ title: `Músicas adicionadas ao álbum "${albumName}"!` });
    invalidatePlaylists();
  };

  // Helper: get active session for current album
  const activeSession = uploadSessions.find((s) => s.albumId === activeAlbumId);
  const isUploadingToAlbum = activeSession?.isUploading ?? false;
  const albumUploadFiles = activeSession?.files ?? [];

  // Minimize handler: close dialog but keep upload running
  const handleMinimizeAlbum = () => {
    setActiveAlbumId(null);
    setPreviewAudioUrl(null);
  };

  // Remove completed session
  const dismissUploadSession = (albumId: number) => {
    setUploadSessions((prev) => prev.filter((s) => s.albumId !== albumId));
  };

  const handleEditPlSubmit = () => {
    if (!editPlTarget || !editPlTarget.name.trim()) return;
    const isActive = editPlTarget.clientAccessMode !== "inactive";
    const clientIds = editPlTarget.clientAccessMode === "all" ? [] : (editPlTarget.selectedClientIds || []);
    updatePl.mutate({
      playlistId: editPlTarget.id,
      data: {
        name: editPlTarget.name.trim(),
        genre: editPlTarget.genre?.trim() || "Variado",
        coverUrl: editPlTarget.coverUrl || undefined,
        allowedPlans: editPlTarget.allowedPlan === "all" ? ["all"] : [editPlTarget.allowedPlan],
        allowedClientIds: clientIds,
        active: isActive,
        playbackMode: editPlTarget.playbackMode || "sequential",
      } as any,
    });
  };

  const formatDuration = (s: number = 0) => {
    const total = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(total / 60);
    const sec = Math.floor(total % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const getClientBadgeText = (pl: any) => {
    const ids: number[] = Array.isArray(pl.allowedClientIds) ? pl.allowedClientIds : [];
    if (ids.length === 0) return "Todos os Clientes";
    if (ids.length === 1) {
      const c = (clients || []).find((cl) => cl.id === ids[0]);
      return c ? c.name : "1 Cliente";
    }
    return `${ids.length} Clientes`;
  };

  const filteredGlobalPlaylists = useMemo(() => {
    if (!globalPlaylists) return [];
    return globalPlaylists.filter((p: any) => {
      if (statusFilter === "active" && p.active === false) return false;
      if (statusFilter === "inactive" && p.active !== false) return false;
      if (playlistGenreFilter !== "all" && p.genre?.toLowerCase() !== playlistGenreFilter.toLowerCase()) {
        return false;
      }
      if (playlistSearch.trim()) {
        const q = playlistSearch.toLowerCase();
        return (
          p.name?.toLowerCase().includes(q) ||
          p.genre?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [globalPlaylists, playlistGenreFilter, playlistSearch, statusFilter]);

  const togglePreviewAudio = (url?: string) => {
    if (!url) return;
    if (previewAudioUrl === url) {
      audioPreviewRef.current?.pause();
      setPreviewAudioUrl(null);
    } else {
      setPreviewAudioUrl(url);
      setTimeout(() => {
        if (audioPreviewRef.current) {
          audioPreviewRef.current.src = url;
          audioPreviewRef.current.play().catch(() => {});
        }
      }, 50);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      {/* Hidden Audio element for previewing tracks in studio */}
      <audio ref={audioPreviewRef} onEnded={() => setPreviewAudioUrl(null)} className="hidden" />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-primary/10 text-primary">
              <Music className="w-6 h-6" />
            </span>
            <span>Biblioteca & Acervo Musical</span>
            {plFetching && !plLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full font-medium animate-pulse ml-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Sincronizando dados...
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie álbuns e estilos musicais com capas temáticas e envie as músicas diretamente para dentro de cada álbum.
          </p>
        </div>

        <Button
          onClick={() => {
            setPlForm({
              name: "",
              genre: playlistGenreFilter !== "all" ? playlistGenreFilter : "Pop",
              customGenre: "",
              allowedPlan: "all",
              clientAccessMode: "all",
              selectedClientIds: [],
              playbackMode: "sequential",
              coverUrl: "",
            });
            setSelectedMusicFiles([]);
            setCreatePlOpen(true);
          }}
          className="gap-2 shadow-md bg-primary hover:bg-primary/90"
          data-testid="button-create-album"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Playlist Musical (Álbum)</span>
        </Button>
      </div>

      {/* Explicativo */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Catálogo de Estilos Musicais Disponíveis no Player
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cada álbum musical criado aqui fica disponível para os lojistas sintonizarem no <strong>Player</strong> de acordo com seus planos (Standard ou Master). Ao criar ou abrir um álbum, você sobe as músicas diretamente para ele!
          </p>
        </div>
      </div>

      {/* Search, Status & Genre Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por álbum ou estilo musical..."
              value={playlistSearch}
              onChange={(e) => setPlaylistSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border self-start sm:self-auto text-xs">
            <span className="text-[11px] text-muted-foreground font-medium px-2">Status:</span>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                statusFilter === "all"
                  ? "bg-background text-foreground shadow-xs border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Todos ({globalPlaylists?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1",
                statusFilter === "active"
                  ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Check className="w-3 h-3 text-emerald-500" />
              <span>Ativas ({(globalPlaylists || []).filter((p: any) => p.active !== false).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1",
                statusFilter === "inactive"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 shadow-xs border border-amber-500/30"
                  : "text-muted-foreground hover:text-amber-600"
              )}
            >
              <EyeOff className="w-3 h-3 text-amber-500" />
              <span>Inativas ({(globalPlaylists || []).filter((p: any) => p.active === false).length})</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Gênero:</span>
          <button
            type="button"
            onClick={() => setPlaylistGenreFilter("all")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
              playlistGenreFilter === "all"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            Todos os Gêneros
          </button>
          {["Pop", "Rock", "Lounge", "Sertanejo", "MPB", "Jazz", "Eletrônica"].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setPlaylistGenreFilter(g)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                playlistGenreFilter.toLowerCase() === g.toLowerCase()
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Album Cards Grid */}
      {plLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border rounded-xl p-4 animate-pulse space-y-3">
              <div className="aspect-square bg-muted rounded-lg w-full" />
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredGlobalPlaylists.length === 0 ? (
        <div className="p-12 text-center bg-card border rounded-2xl border-dashed">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <ListMusic className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Nenhum álbum musical encontrado</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
            Crie seu primeiro álbum musical temático (como Pop Hits, Lounge Sunset, Sertanejo Acústico), escolha a capa e adicione as músicas diretamente dentro dele!
          </p>
          <Button onClick={() => setCreatePlOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Criar Primeiro Álbum
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filteredGlobalPlaylists.map((pl: any) => {
            const isMasterOnly = pl.allowedPlans && pl.allowedPlans.length === 1 && pl.allowedPlans[0] === "master";
            const isStandardOnly = pl.allowedPlans && pl.allowedPlans.length === 1 && pl.allowedPlans[0] === "standard";

            return (
              <div
                key={pl.id}
                data-testid={`card-album-${pl.id}`}
                className="group bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
              >
                {/* Cover Art Container */}
                <div
                  onClick={() => setActiveAlbumId(pl.id)}
                  className="relative aspect-square bg-muted overflow-hidden cursor-pointer"
                >
                  {pl.coverUrl ? (
                    <img
                      src={pl.coverUrl}
                      alt={pl.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center text-white p-4 text-center">
                      <Music className="w-12 h-12 opacity-40 mb-2" />
                      <span className="text-xs font-bold uppercase tracking-wider opacity-80">{pl.genre || "Música"}</span>
                    </div>
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 pointer-events-none">
                    {pl.genre && (
                      <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wide border border-white/10 shadow">
                        {pl.genre}
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      {pl.active === false && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide shadow backdrop-blur-md bg-amber-600/90 text-white flex items-center gap-1">
                          <EyeOff className="w-2.5 h-2.5" /> Inativa
                        </span>
                      )}
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide shadow backdrop-blur-md",
                          isMasterOnly
                            ? "bg-amber-500/90 text-black"
                            : isStandardOnly
                            ? "bg-blue-500/90 text-white"
                            : "bg-emerald-600/90 text-white"
                        )}
                      >
                        {isMasterOnly ? "Master" : isStandardOnly ? "Standard" : "Todos Planos"}
                      </span>
                    </div>
                  </div>

                  {/* Hover Overlay Button to Manage Songs */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-4">
                    <Button size="sm" className="gap-1.5 shadow-lg bg-primary hover:bg-primary/90 text-xs">
                      <ListMusic className="w-3.5 h-3.5" /> Abrir Álbum & Músicas
                    </Button>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h4
                      onClick={() => setActiveAlbumId(pl.id)}
                      className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors cursor-pointer"
                    >
                      {pl.name}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pl.itemCount ?? 0} {pl.itemCount === 1 ? "música cadastrada" : "músicas cadastradas"}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {pl.active === false ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                          title="Playlist inativa: visível apenas nesta tela de gestão até ser ativada"
                        >
                          <EyeOff className="w-3 h-3 text-amber-500" />
                          <span>Inativa (Oculta p/ Clientes)</span>
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border",
                            Array.isArray(pl.allowedClientIds) && pl.allowedClientIds.length > 0
                              ? "bg-primary/10 text-primary border-primary/25"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                          title={
                            Array.isArray(pl.allowedClientIds) && pl.allowedClientIds.length > 0
                              ? `Exclusivo para: ${pl.allowedClientIds.map((cid: number) => clients?.find((c) => c.id === cid)?.name || `ID ${cid}`).join(", ")}`
                              : "Disponível para todos os clientes"
                          }
                        >
                          <Users className="w-3 h-3" />
                          <span className="truncate max-w-[150px]">{getClientBadgeText(pl)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveAlbumId(pl.id)}
                      className="text-primary hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Gerenciar músicas</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        title="Editar capa e detalhes"
                        onClick={() => {
                          const plan = pl.allowedPlans && pl.allowedPlans.length === 1 ? pl.allowedPlans[0] : "all";
                          const clientIds = Array.isArray(pl.allowedClientIds) ? pl.allowedClientIds : [];
                          const isActive = pl.active !== false;
                          const clientAccessMode: "all" | "specific" | "inactive" = !isActive
                            ? "inactive"
                            : clientIds.length > 0
                            ? "specific"
                            : "all";
                          setEditPlTarget({
                            id: pl.id,
                            name: pl.name,
                            genre: pl.genre || "Pop",
                            coverUrl: pl.coverUrl || "",
                            allowedPlan: plan,
                            clientAccessMode,
                            selectedClientIds: clientIds,
                            playbackMode: pl.playbackMode || "sequential",
                            active: isActive,
                          });
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title="Excluir álbum"
                        onClick={() => setDeletePlTarget({ id: pl.id, name: pl.name })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: CRIAR NOVA PLAYLIST MUSICAL (COM UPLOAD DIRETO DE MÚSICAS)
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={createPlOpen} onOpenChange={(o) => { if (!isCreatingAlbum) setCreatePlOpen(o); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Music className="w-5 h-5" />
              </span>
              <span>Criar Álbum Musical & Subir Músicas</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Nome do Álbum / Playlist *</Label>
              <Input
                placeholder="Ex: Pop Hits 2026, Lounge Sunset, Sertanejo Acústico"
                value={plForm.name}
                onChange={(e) => setPlForm({ ...plForm, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Gênero Musical</Label>
                <Select
                  value={plForm.genre}
                  onValueChange={(g) => setPlForm({ ...plForm, genre: g })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pop">Pop</SelectItem>
                    <SelectItem value="Rock">Rock</SelectItem>
                    <SelectItem value="Lounge">Lounge / Café</SelectItem>
                    <SelectItem value="Sertanejo">Sertanejo</SelectItem>
                    <SelectItem value="MPB">MPB</SelectItem>
                    <SelectItem value="Jazz">Jazz / Blues</SelectItem>
                    <SelectItem value="Eletrônica">Eletrônica</SelectItem>
                    <SelectItem value="Gospel">Gospel</SelectItem>
                    <SelectItem value="Instrumental">Instrumental</SelectItem>
                    <SelectItem value="custom">Outro personalizado...</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Acesso por Plano</Label>
                <Select
                  value={plForm.allowedPlan}
                  onValueChange={(p) => setPlForm({ ...plForm, allowedPlan: p })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Standard & Master (Todos)</SelectItem>
                    <SelectItem value="master">Exclusivo Master</SelectItem>
                    <SelectItem value="standard">Somente Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Destino dos Clientes (Vínculo de Clientes) */}
            <div className="p-3 rounded-xl border bg-muted/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Vincular aos Clientes</span>
                </Label>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {plForm.clientAccessMode === "all"
                    ? "Liberado para todos os clientes"
                    : plForm.clientAccessMode === "specific"
                    ? `${plForm.selectedClientIds.length} cliente(s) selecionado(s)`
                    : "Inativa (oculta para clientes)"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setPlForm({ ...plForm, clientAccessMode: "all", selectedClientIds: [] })}
                  className={cn(
                    "p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all cursor-pointer",
                    plForm.clientAccessMode === "all"
                      ? "border-primary bg-primary/10 text-foreground font-semibold shadow-xs"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  )}
                >
                  <div className={cn("w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center flex-none", plForm.clientAccessMode === "all" ? "border-primary bg-primary text-white" : "border-muted-foreground")}>
                    {plForm.clientAccessMode === "all" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Todos os Clientes</div>
                    <div className="text-[10px] text-muted-foreground font-normal">Disponível para qualquer rádio do plano</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPlForm({ ...plForm, clientAccessMode: "specific" })}
                  className={cn(
                    "p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all cursor-pointer",
                    plForm.clientAccessMode === "specific"
                      ? "border-primary bg-primary/10 text-foreground font-semibold shadow-xs"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  )}
                >
                  <div className={cn("w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center flex-none", plForm.clientAccessMode === "specific" ? "border-primary bg-primary text-white" : "border-muted-foreground")}>
                    {plForm.clientAccessMode === "specific" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Clientes Específicos</div>
                    <div className="text-[10px] text-muted-foreground font-normal">Selecione quais clientes terão acesso</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPlForm({ ...plForm, clientAccessMode: "inactive" })}
                  className={cn(
                    "p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all cursor-pointer",
                    plForm.clientAccessMode === "inactive"
                      ? "border-amber-500 bg-amber-500/10 text-foreground font-semibold shadow-xs"
                      : "border-border bg-background text-muted-foreground hover:border-amber-500/50"
                  )}
                >
                  <div className={cn("w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center flex-none", plForm.clientAccessMode === "inactive" ? "border-amber-500 bg-amber-500 text-white" : "border-muted-foreground")}>
                    {plForm.clientAccessMode === "inactive" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      <span>Inativa</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold uppercase">Standby</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-normal">Oculta para clientes até você ativar</div>
                  </div>
                </button>
              </div>

              {/* Aviso quando Inativa */}
              {plForm.clientAccessMode === "inactive" && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-none text-amber-500" />
                  <span>Esta playlist fica criada e pronta no sistema, visível apenas para a gestão nesta tela. Ela não aparecerá para nenhum cliente até ser ativada.</span>
                </div>
              )}

              {/* Lista de clientes para seleção quando específico */}
              {plForm.clientAccessMode === "specific" && (
                <div className="pt-2 border-t border-border/60 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Filtrar clientes..."
                        value={createClientSearch}
                        onChange={(e) => setCreateClientSearch(e.target.value)}
                        className="h-7 text-xs pl-8"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 flex-none text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = (clients || []).map((c) => c.id);
                          setPlForm({ ...plForm, selectedClientIds: allIds });
                        }}
                        className="text-primary hover:underline"
                      >
                        Marcar todos
                      </button>
                      <span className="text-muted-foreground">|</span>
                      <button
                        type="button"
                        onClick={() => setPlForm({ ...plForm, selectedClientIds: [] })}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>

                  <div className="max-h-36 overflow-y-auto border rounded-lg divide-y bg-background">
                    {(!clients || clients.length === 0) ? (
                      <div className="p-3 text-center text-xs text-muted-foreground">Nenhum cliente cadastrado</div>
                    ) : (
                      clients
                        .filter((c) => !createClientSearch.trim() || c.name.toLowerCase().includes(createClientSearch.toLowerCase()))
                        .map((client) => {
                          const isSelected = plForm.selectedClientIds.includes(client.id);
                          return (
                            <label
                              key={client.id}
                              className="flex items-center gap-2.5 p-2 hover:bg-muted/40 cursor-pointer text-xs transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setPlForm({ ...plForm, selectedClientIds: [...plForm.selectedClientIds, client.id] });
                                  } else {
                                    setPlForm({ ...plForm, selectedClientIds: plForm.selectedClientIds.filter((id) => id !== client.id) });
                                  }
                                }}
                                className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold text-foreground truncate block">{client.name}</span>
                                <span className="text-[10px] text-muted-foreground">{client.plan === "master" ? "Plano Master" : "Plano Standard"}</span>
                              </div>
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>
              )}
            </div>

            {plForm.genre === "custom" && (
              <div>
                <Label className="text-xs font-semibold">Digite o Gênero</Label>
                <Input
                  placeholder="Ex: Pagode, Reggae, Clássica..."
                  value={plForm.customGenre}
                  onChange={(e) => setPlForm({ ...plForm, customGenre: e.target.value })}
                  className="mt-1"
                />
              </div>
            )}

            {/* Capa do Álbum */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs font-semibold flex items-center justify-between">
                <span>Foto de Capa do Álbum</span>
                <span className="text-[10px] text-muted-foreground font-normal">PNG, JPG ou WebP</span>
              </Label>

              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-muted border overflow-hidden flex-none relative group">
                  {plForm.coverUrl ? (
                    <img src={plForm.coverUrl} alt="Preview da Capa" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground text-[10px] text-center p-1">
                      <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                      <span>Sem capa</span>
                    </div>
                  )}
                  {coverUploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <input
                    ref={coverFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleCoverUpload(e, false)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => coverFileInputRef.current?.click()}
                      disabled={coverUploading}
                      className="gap-1.5 text-xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{coverUploading ? "Enviando..." : "Upload de Imagem"}</span>
                    </Button>
                    {plForm.coverUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPlForm({ ...plForm, coverUrl: "" })}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                  <Input
                    placeholder="Ou cole a URL da imagem aqui"
                    value={plForm.coverUrl}
                    onChange={(e) => setPlForm({ ...plForm, coverUrl: e.target.value })}
                    className="text-xs h-8"
                  />
                </div>
              </div>

              {/* Sugestões de Capas Pré-definidas */}
              <div className="pt-2">
                <span className="text-[11px] text-muted-foreground block mb-2">Ou escolha uma capa predefinida:</span>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_COVERS.map((preset) => (
                    <div
                      key={preset.genre}
                      onClick={() => setPlForm({ ...plForm, coverUrl: preset.url, genre: preset.genre })}
                      className={cn(
                        "rounded-lg overflow-hidden border cursor-pointer hover:opacity-90 transition-all text-center relative aspect-square",
                        plForm.coverUrl === preset.url ? "ring-2 ring-primary border-primary" : "border-border"
                      )}
                    >
                      <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white font-semibold py-0.5 truncate px-1">
                        {preset.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* SELEÇÃO E UPLOAD DE MÚSICAS DIRETO NESTE ÁLBUM */}
            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                  <Music className="w-4 h-4 text-primary" />
                  <span>Subir Músicas para dentro deste Álbum</span>
                </Label>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {selectedMusicFiles.length} música(s) selecionada(s)
                </span>
              </div>

              <input
                ref={musicFileInputRef}
                type="file"
                multiple
                accept="audio/*"
                className="hidden"
                onChange={(e) => handleNewAlbumMusicSelect(e.target.files)}
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => musicFileInputRef.current?.click()}
                disabled={isCreatingAlbum}
                className="w-full py-6 border-dashed border-2 flex flex-col items-center gap-1 hover:bg-muted/40"
              >
                <Upload className="w-5 h-5 text-primary opacity-80" />
                <span className="text-xs font-semibold">Clique para selecionar arquivos MP3 deste álbum</span>
                <span className="text-[10px] text-muted-foreground">Você pode selecionar várias faixas de uma vez</span>
              </Button>

              {selectedMusicFiles.length > 0 && (
                <div className="space-y-2">
                  {/* Barra de progresso global durante upload */}
                  {isCreatingAlbum && (() => {
                    const completedCount = selectedMusicFiles.filter(u => u.status === "done" || u.status === "error").length;
                    const totalCount = selectedMusicFiles.length;
                    const globalPercent = Math.round((completedCount / totalCount) * 100);
                    return (
                      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-foreground flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            Enviando músicas...
                          </p>
                          <span className="text-sm font-bold text-primary font-mono whitespace-nowrap">
                            {completedCount} de {totalCount}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden border">
                            <div
                              className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${globalPercent}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {completedCount < totalCount
                                ? `Enviando arquivo ${completedCount + 1} de ${totalCount}...`
                                : "Finalizando..."}
                            </span>
                            <span className="font-mono font-semibold text-foreground">{globalPercent}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 border rounded-lg p-2 bg-muted/20">
                    {selectedMusicFiles.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 p-1.5 rounded bg-card border text-xs">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {item.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-none" />}
                          {item.status === "uploading" && <Loader2 className="w-3 h-3 animate-spin text-primary flex-none" />}
                          {item.status === "error" && <XCircle className="w-3.5 h-3.5 text-destructive flex-none" />}
                          <span className={cn(
                            "truncate flex-1 font-medium",
                            item.status === "done" ? "text-muted-foreground line-through" : ""
                          )}>{item.title}</span>
                        </div>
                        {item.status === "uploading" && (
                          <span className="text-[10px] text-primary font-mono flex items-center gap-1">
                            {item.progress}%
                          </span>
                        )}
                        {item.status === "done" && (
                          <span className="text-[10px] text-emerald-600 font-mono font-semibold">100%</span>
                        )}
                        {item.status === "queued" && (
                          <button
                            type="button"
                            onClick={() => setSelectedMusicFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-muted-foreground hover:text-destructive p-0.5"
                            title="Remover da lista"
                            disabled={isCreatingAlbum}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreatePlOpen(false)} disabled={isCreatingAlbum}>
              Cancelar
            </Button>
            <Button onClick={handleCreateAlbumSubmit} disabled={isCreatingAlbum}>
              {isCreatingAlbum ? "Criando e Enviando Músicas..." : "Salvar e Criar Álbum"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ÁLBUM STUDIO (VISUALIZAR, OUVIR E SUBIR MÚSICAS NO ÁLBUM)
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={!!activeAlbumId} onOpenChange={(o) => { if (!o) handleMinimizeAlbum(); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          {albumLoading ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
          ) : activeAlbumData ? (
            <div className="space-y-5">
              {/* Header do Álbum */}
              <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/40 border">
                {activeAlbumData.coverUrl ? (
                  <img
                    src={activeAlbumData.coverUrl}
                    alt={activeAlbumData.name}
                    className="w-24 h-24 rounded-lg object-cover border shadow-sm flex-none"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-lg bg-primary/10 border flex items-center justify-center text-primary flex-none">
                    <Music className="w-10 h-10" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-foreground truncate">{activeAlbumData.name}</h2>
                    {activeAlbumData.genre && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold uppercase">
                        {activeAlbumData.genre}
                      </span>
                    )}
                    {(activeAlbumData as any).active === false ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-bold uppercase flex items-center gap-1">
                        <EyeOff className="w-3 h-3" /> Inativa
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-bold uppercase flex items-center gap-1">
                        <Check className="w-3 h-3" /> Ativa
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeAlbumData.items?.length ?? 0} faixas cadastradas neste álbum
                  </p>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => albumDirectInputRef.current?.click()}
                      disabled={isUploadingToAlbum}
                      className="gap-1.5 text-xs shadow-sm bg-primary hover:bg-primary/90"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Subir Músicas para este Álbum</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const plan = activeAlbumData.allowedPlans && activeAlbumData.allowedPlans.length === 1 ? activeAlbumData.allowedPlans[0] : "all";
                        const clientIds = Array.isArray((activeAlbumData as any).allowedClientIds) ? (activeAlbumData as any).allowedClientIds : [];
                        const isActive = (activeAlbumData as any).active !== false;
                        const clientAccessMode: "all" | "specific" | "inactive" = !isActive
                          ? "inactive"
                          : clientIds.length > 0
                          ? "specific"
                          : "all";
                        setEditPlTarget({
                          id: activeAlbumData.id,
                          name: activeAlbumData.name,
                          genre: activeAlbumData.genre || "Pop",
                          coverUrl: activeAlbumData.coverUrl || "",
                          allowedPlan: plan,
                          clientAccessMode,
                          selectedClientIds: clientIds,
                          playbackMode: activeAlbumData.playbackMode || "sequential",
                          active: isActive,
                        });
                      }}
                      className="text-xs gap-1"
                    >
                      <Pencil className="w-3 h-3" /> Editar Capa / Dados
                    </Button>
                    {isUploadingToAlbum && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleMinimizeAlbum}
                        className="text-xs gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                        title="Minimizar e continuar upload em segundo plano"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                        <span>Minimizar Upload</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <input
                ref={albumDirectInputRef}
                type="file"
                multiple
                accept="audio/*"
                className="hidden"
                onChange={(e) => handleDirectAlbumMusicUpload(e.target.files)}
              />

              {/* Progress bar of current upload into this album */}
              {isUploadingToAlbum && albumUploadFiles.length > 0 && (() => {
                const completedCount = albumUploadFiles.filter(u => u.status === "done" || u.status === "error").length;
                const totalCount = albumUploadFiles.length;
                const globalPercent = Math.round((completedCount / totalCount) * 100);
                return (
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-3">
                    {/* Header com contador X de Y */}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        Enviando novas músicas para o álbum...
                      </p>
                      <span className="text-sm font-bold text-primary font-mono whitespace-nowrap">
                        {completedCount} de {totalCount}
                      </span>
                    </div>

                    {/* Barra de progresso global */}
                    <div className="space-y-1.5">
                      <div className="w-full h-3 bg-muted rounded-full overflow-hidden border">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${globalPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {completedCount < totalCount
                            ? `Enviando arquivo ${completedCount + 1} de ${totalCount}...`
                            : "Finalizando..."}
                        </span>
                        <span className="font-mono font-semibold text-foreground">{globalPercent}%</span>
                      </div>
                    </div>

                    {/* Lista de arquivos com status individual */}
                    <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                      {albumUploadFiles.map((u, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {u.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-none" />}
                            {u.status === "uploading" && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-none" />}
                            {u.status === "queued" && <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 flex-none" />}
                            {u.status === "error" && <XCircle className="w-3.5 h-3.5 text-destructive flex-none" />}
                            <span className={cn("truncate", u.status === "done" ? "text-muted-foreground line-through" : "text-foreground")}>{u.title}</span>
                          </div>
                          <span className={cn(
                            "font-mono text-[10px] flex-none",
                            u.status === "done" ? "text-emerald-600 font-semibold" : "text-muted-foreground"
                          )}>
                            {u.status === "done" ? "100%" : u.status === "error" ? "Erro" : `${u.progress}%`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Lista de Músicas do Álbum */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Faixas deste Álbum</span>
                  <span className="font-mono">{activeAlbumData.items?.length ?? 0}</span>
                </h4>

                {(!activeAlbumData.items || activeAlbumData.items.length === 0) ? (
                  <div className="p-8 text-center border rounded-xl border-dashed bg-muted/20 text-xs text-muted-foreground">
                    Este álbum ainda não possui nenhuma música cadastrada. Clique no botão acima para selecionar e subir arquivos MP3!
                  </div>
                ) : (
                  <div className="border rounded-xl divide-y overflow-hidden max-h-[45vh] overflow-y-auto">
                    {activeAlbumData.items.map((item: any, idx: number) => {
                      const isPreviewing = previewAudioUrl === item.media?.url;
                      return (
                        <div key={item.id} className="p-2.5 sm:p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-xs font-mono text-muted-foreground/60 w-5 text-center flex-none">
                              {idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePreviewAudio(item.media?.url)}
                              className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-none hover:bg-primary hover:text-white transition-colors"
                              title={isPreviewing ? "Pausar prévia" : "Ouvir prévia"}
                            >
                              {isPreviewing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                            </button>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                                {item.media?.title || "Música"}
                              </p>
                              {item.media?.artist && (
                                <p className="text-[11px] text-muted-foreground truncate">{item.media.artist}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-none">
                            <span className="text-xs font-mono text-muted-foreground">
                              {formatDuration(item.media?.duration)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              title="Remover deste álbum"
                              onClick={() => removePlaylistItem.mutate({ playlistId: activeAlbumData.id, itemId: item.id })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-row justify-between sm:justify-between">
            {isUploadingToAlbum ? (
              <Button
                variant="outline"
                onClick={handleMinimizeAlbum}
                className="gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
              >
                <Minimize2 className="w-4 h-4" />
                Minimizar (upload continua)
              </Button>
            ) : (
              <div />
            )}
            <Button variant="outline" onClick={handleMinimizeAlbum}>
              {isUploadingToAlbum ? "Fechar & Continuar em 2º Plano" : "Fechar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: EDITAR METADADOS DO ÁLBUM
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={!!editPlTarget} onOpenChange={(o) => { if (!o) setEditPlTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Álbum Musical</DialogTitle>
          </DialogHeader>

          {editPlTarget && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-semibold">Nome do Álbum</Label>
                <Input
                  value={editPlTarget.name}
                  onChange={(e) => setEditPlTarget({ ...editPlTarget, name: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Gênero Musical</Label>
                  <Input
                    value={editPlTarget.genre || ""}
                    onChange={(e) => setEditPlTarget({ ...editPlTarget, genre: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Plano Autorizado</Label>
                  <Select
                    value={editPlTarget.allowedPlan || "all"}
                    onValueChange={(p) => setEditPlTarget({ ...editPlTarget, allowedPlan: p })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Standard & Master</SelectItem>
                      <SelectItem value="master">Exclusivo Master</SelectItem>
                      <SelectItem value="standard">Somente Standard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Destino dos Clientes (Vínculo de Clientes na Edição) */}
              <div className="p-3 rounded-xl border bg-muted/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-primary" />
                    <span>Vincular aos Clientes</span>
                  </Label>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {editPlTarget.clientAccessMode === "all"
                      ? "Liberado para todos os clientes"
                      : editPlTarget.clientAccessMode === "specific"
                      ? `${(editPlTarget.selectedClientIds || []).length} cliente(s) selecionado(s)`
                      : "Inativa (oculta para clientes)"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditPlTarget({ ...editPlTarget, clientAccessMode: "all", selectedClientIds: [] })}
                    className={cn(
                      "p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all cursor-pointer",
                      editPlTarget.clientAccessMode === "all"
                        ? "border-primary bg-primary/10 text-foreground font-semibold shadow-xs"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    <div className={cn("w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center flex-none", editPlTarget.clientAccessMode === "all" ? "border-primary bg-primary text-white" : "border-muted-foreground")}>
                      {editPlTarget.clientAccessMode === "all" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="text-xs font-semibold">Todos os Clientes</div>
                      <div className="text-[10px] text-muted-foreground font-normal">Disponível para qualquer rádio do plano</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditPlTarget({ ...editPlTarget, clientAccessMode: "specific" })}
                    className={cn(
                      "p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all cursor-pointer",
                      editPlTarget.clientAccessMode === "specific"
                        ? "border-primary bg-primary/10 text-foreground font-semibold shadow-xs"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    <div className={cn("w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center flex-none", editPlTarget.clientAccessMode === "specific" ? "border-primary bg-primary text-white" : "border-muted-foreground")}>
                      {editPlTarget.clientAccessMode === "specific" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="text-xs font-semibold">Clientes Específicos</div>
                      <div className="text-[10px] text-muted-foreground font-normal">Selecione quais clientes terão acesso</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditPlTarget({ ...editPlTarget, clientAccessMode: "inactive" })}
                    className={cn(
                      "p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all cursor-pointer",
                      editPlTarget.clientAccessMode === "inactive"
                        ? "border-amber-500 bg-amber-500/10 text-foreground font-semibold shadow-xs"
                        : "border-border bg-background text-muted-foreground hover:border-amber-500/50"
                    )}
                  >
                    <div className={cn("w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center flex-none", editPlTarget.clientAccessMode === "inactive" ? "border-amber-500 bg-amber-500 text-white" : "border-muted-foreground")}>
                      {editPlTarget.clientAccessMode === "inactive" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <span>Inativa</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold uppercase">Standby</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-normal">Oculta para clientes até você ativar</div>
                    </div>
                  </button>
                </div>

                {/* Aviso quando Inativa */}
                {editPlTarget.clientAccessMode === "inactive" && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-none text-amber-500" />
                    <span>Esta playlist está inativa no sistema, visível apenas para a gestão nesta tela. Ela não aparecerá para os clientes até você mudar para "Todos os Clientes" ou "Clientes Específicos".</span>
                  </div>
                )}

                {/* Lista de clientes para seleção na edição */}
                {editPlTarget.clientAccessMode === "specific" && (
                  <div className="pt-2 border-t border-border/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Filtrar clientes..."
                          value={editClientSearch}
                          onChange={(e) => setEditClientSearch(e.target.value)}
                          className="h-7 text-xs pl-8"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-none text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            const allIds = (clients || []).map((c) => c.id);
                            setEditPlTarget({ ...editPlTarget, selectedClientIds: allIds });
                          }}
                          className="text-primary hover:underline"
                        >
                          Marcar todos
                        </button>
                        <span className="text-muted-foreground">|</span>
                        <button
                          type="button"
                          onClick={() => setEditPlTarget({ ...editPlTarget, selectedClientIds: [] })}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    <div className="max-h-36 overflow-y-auto border rounded-lg divide-y bg-background">
                      {(!clients || clients.length === 0) ? (
                        <div className="p-3 text-center text-xs text-muted-foreground">Nenhum cliente cadastrado</div>
                      ) : (
                        clients
                          .filter((c) => !editClientSearch.trim() || c.name.toLowerCase().includes(editClientSearch.toLowerCase()))
                          .map((client) => {
                            const isSelected = (editPlTarget.selectedClientIds || []).includes(client.id);
                            return (
                              <label
                                key={client.id}
                                className="flex items-center gap-2.5 p-2 hover:bg-muted/40 cursor-pointer text-xs transition-colors"
                              >
                                <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const cur = editPlTarget.selectedClientIds || [];
                                  if (e.target.checked) {
                                    setEditPlTarget({ ...editPlTarget, selectedClientIds: [...cur, client.id] });
                                  } else {
                                    setEditPlTarget({ ...editPlTarget, selectedClientIds: cur.filter((id: number) => id !== client.id) });
                                  }
                                }}
                                className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold text-foreground truncate block">{client.name}</span>
                                <span className="text-[10px] text-muted-foreground">{client.plan === "master" ? "Plano Master" : "Plano Standard"}</span>
                              </div>
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>
              )}
            </div>

              {/* Capa */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold">Capa do Álbum</Label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl bg-muted border overflow-hidden flex-none">
                    {editPlTarget.coverUrl ? (
                      <img src={editPlTarget.coverUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        Sem capa
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="edit-cover-file-input"
                      onChange={(e) => handleCoverUpload(e, true)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById("edit-cover-file-input")?.click()}
                      disabled={coverUploading}
                      className="text-xs gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{coverUploading ? "Enviando..." : "Alterar Imagem"}</span>
                    </Button>
                    <Input
                      placeholder="Ou URL da imagem"
                      value={editPlTarget.coverUrl || ""}
                      onChange={(e) => setEditPlTarget({ ...editPlTarget, coverUrl: e.target.value })}
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlTarget(null)}>Cancelar</Button>
            <Button onClick={handleEditPlSubmit} disabled={updatePl.isPending}>
              {updatePl.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: EXCLUIR ÁLBUM
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={!!deletePlTarget} onOpenChange={(o) => { if (!o) setDeletePlTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Álbum Musical?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza de que deseja excluir o álbum <strong>{deletePlTarget?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deletePlTarget && delPl.mutate({ playlistId: deletePlTarget.id })}
              disabled={delPl.isPending}
            >
              {delPl.isPending ? "Excluindo..." : "Excluir Álbum"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          FLOATING MINIMIZED UPLOAD BARS (background uploads)
      ───────────────────────────────────────────────────────────── */}
      {uploadSessions.filter((s) => s.albumId !== activeAlbumId).length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full">
          {uploadSessions
            .filter((s) => s.albumId !== activeAlbumId)
            .map((session) => {
              const completedCount = session.files.filter((f) => f.status === "done" || f.status === "error").length;
              const totalCount = session.files.length;
              const globalPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

              return (
                <div
                  key={session.albumId}
                  className="bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
                >
                  {/* Progress bar on top */}
                  <div className="h-1.5 bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-r-full transition-all duration-500",
                        session.isUploading
                          ? "bg-gradient-to-r from-primary to-primary/80"
                          : globalPercent === 100
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      )}
                      style={{ width: `${globalPercent}%` }}
                    />
                  </div>

                  <div className="p-3 flex items-center gap-3">
                    {/* Cover thumbnail */}
                    {session.coverUrl ? (
                      <img
                        src={session.coverUrl}
                        alt={session.albumName}
                        className="w-10 h-10 rounded-lg object-cover border flex-none"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-primary/10 border flex items-center justify-center text-primary flex-none">
                        <Music className="w-5 h-5" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-foreground truncate">{session.albumName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {session.isUploading ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-primary flex-none" />
                            <span className="text-[11px] text-muted-foreground">
                              Enviando {completedCount + 1} de {totalCount}...
                            </span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-none" />
                            <span className="text-[11px] text-emerald-600">
                              {completedCount} de {totalCount} concluído(s)
                            </span>
                          </>
                        )}
                        <span className="text-[11px] font-mono font-bold text-foreground ml-auto">
                          {globalPercent}%
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-none">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/10"
                        title="Abrir álbum"
                        onClick={() => setActiveAlbumId(session.albumId)}
                      >
                        <Maximize2 className="w-4 h-4" />
                      </Button>
                      {!session.isUploading && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title="Dispensar"
                          onClick={() => dismissUploadSession(session.albumId)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
