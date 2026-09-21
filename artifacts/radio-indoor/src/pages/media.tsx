import { useState, useRef, useMemo, useEffect } from "react";
import { Link } from "wouter";
import {
  Upload, Trash2, Music, Mic, Filter, CheckSquare, Square, Clock, Loader2,
  CheckCircle2, XCircle, RotateCw, X, Building2, MapPin, ListMusic, Plus,
  Image as ImageIcon, Sparkles, Globe, ExternalLink, Search, Play, Pencil
} from "lucide-react";
import {
  useListMedia, getListMediaQueryKey,
  useDeleteMedia, useDeleteMediaBatch,
  useListClients, getListClientsQueryKey,
  useListPlaylists, getListPlaylistsQueryKey,
  useCreatePlaylist, useUpdatePlaylist, useDeletePlaylist,
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

interface UploadItem {
  file: File;
  title: string;
  type: "music" | "jingle" | "voiceover";
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
}

const PRESET_COVERS = [
  { genre: "Pop", url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80", label: "Pop Neon" },
  { genre: "Rock", url: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80", label: "Rock Concert" },
  { genre: "Lounge", url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&auto=format&fit=crop&q=80", label: "Lounge & Sunset" },
  { genre: "Sertanejo", url: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80", label: "Acústico" },
  { genre: "MPB", url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80", label: "MPB & Voz" },
  { genre: "Jazz", url: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&auto=format&fit=crop&q=80", label: "Jazz Club" },
  { genre: "Eletrônica", url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80", label: "Club & Beats" },
  { genre: "Lo-Fi", url: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80", label: "Lo-Fi Chill" },
];

export default function MediaPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"playlists" | "commercials">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "commercials" ? "commercials" : "playlists";
  });

  // ── Playlist Search & Filters ──
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [playlistGenreFilter, setPlaylistGenreFilter] = useState("all");

  // ── Create/Edit Playlist Modal ──
  const [createPlOpen, setCreatePlOpen] = useState(false);
  const [plForm, setPlForm] = useState({
    name: "",
    genre: "Pop",
    customGenre: "",
    allowedPlan: "all",
    playbackMode: "sequential",
    coverUrl: "",
  });
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  const [editPlTarget, setEditPlTarget] = useState<any | null>(null);
  const [deletePlTarget, setDeletePlTarget] = useState<{ id: number; name: string } | null>(null);

  // ── Central Music Upload Modal (batch upload MP3s to global library) ──
  const [uploadMusicOpen, setUploadMusicOpen] = useState(false);
  const [musicUploadItems, setMusicUploadItems] = useState<UploadItem[]>([]);
  const [isMusicUploading, setIsMusicUploading] = useState(false);
  const musicFileInputRef = useRef<HTMLInputElement>(null);

  // ── Commercials / Clients State ──
  const [clientFilter, setClientFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("clientId") || "";
  });
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadClientId, setUploadClientId] = useState<string>("");
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [targetAllUnits, setTargetAllUnits] = useState(true);
  const [selectedUnitEmails, setSelectedUnitEmails] = useState<string[]>([]);
  const [editingTargetMedia, setEditingTargetMedia] = useState<any | null>(null);
  const [editingUnitEmails, setEditingUnitEmails] = useState<string[]>([]);
  const [isSavingTargeting, setIsSavingTargeting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Queries ──
  const { data: clients } = useListClients({ query: { queryKey: getListClientsQueryKey() } });

  useEffect(() => {
    if (!clientFilter && Array.isArray(clients) && clients.length > 0) {
      setClientFilter(String(clients[0]!.id));
    }
  }, [clients, clientFilter]);

  const globalPlParams = { isGlobal: true } as any;
  const { data: globalPlaylists, isLoading: plLoading } = useListPlaylists(globalPlParams, {
    query: { queryKey: getListPlaylistsQueryKey(globalPlParams) },
  });

  const mediaParams: { clientId?: number; type?: "music" | "jingle" | "voiceover" } = {};
  if (clientFilter) mediaParams.clientId = parseInt(clientFilter);
  if (typeFilter !== "all") mediaParams.type = typeFilter as "music" | "jingle" | "voiceover";

  const { data: media, isLoading: mediaLoading } = useListMedia(mediaParams, {
    query: { queryKey: getListMediaQueryKey(mediaParams), enabled: activeTab === "commercials" && !!clientFilter },
  });

  const invalidatePlaylists = () => qc.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
  const invalidateMedia = () => qc.invalidateQueries({ queryKey: getListMediaQueryKey() });

  // ── Mutations for Playlists ──
  const createPl = useCreatePlaylist({
    mutation: {
      onSuccess: () => {
        toast({ title: "Playlist musical criada com sucesso!" });
        invalidatePlaylists();
        setCreatePlOpen(false);
        setPlForm({
          name: "",
          genre: "Pop",
          customGenre: "",
          allowedPlan: "all",
          playbackMode: "sequential",
          coverUrl: "",
        });
      },
      onError: () => toast({ title: "Erro ao criar playlist", variant: "destructive" }),
    },
  });

  const updatePl = useUpdatePlaylist({
    mutation: {
      onSuccess: () => {
        toast({ title: "Playlist atualizada com sucesso!" });
        invalidatePlaylists();
        setEditPlTarget(null);
      },
      onError: () => toast({ title: "Erro ao atualizar playlist", variant: "destructive" }),
    },
  });

  const delPl = useDeletePlaylist({
    mutation: {
      onSuccess: () => {
        toast({ title: "Playlist removida com sucesso" });
        invalidatePlaylists();
        setDeletePlTarget(null);
      },
      onError: () => toast({ title: "Erro ao remover playlist", variant: "destructive" }),
    },
  });

  // ── Mutations for Media ──
  const del = useDeleteMedia({
    mutation: {
      onSuccess: () => { toast({ title: "Mídia removida" }); invalidateMedia(); },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    },
  });

  const delBatch = useDeleteMediaBatch({
    mutation: {
      onSuccess: (res) => {
        toast({ title: `${res.deleted} ${res.deleted === 1 ? "mídia removida" : "mídias removidas"}` });
        invalidateMedia();
        setSelected(new Set());
        setConfirmBulkDelete(false);
      },
      onError: () => toast({ title: "Erro ao remover mídias", variant: "destructive" }),
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
        toast({ title: "Capa carregada com sucesso!" });
      }
    } catch {
      toast({ title: "Falha ao carregar capa", variant: "destructive" });
    } finally {
      setCoverUploading(false);
    }
  };

  const handleCreatePlSubmit = () => {
    if (!plForm.name.trim()) {
      toast({ title: "Informe o nome da playlist", variant: "destructive" });
      return;
    }
    const finalGenre = plForm.genre === "custom" ? plForm.customGenre.trim() || "Variado" : plForm.genre;
    createPl.mutate({
      data: {
        name: plForm.name.trim(),
        clientId: 1,
        isGlobal: true,
        playbackMode: plForm.playbackMode as "sequential" | "shuffle",
        genre: finalGenre,
        coverUrl: plForm.coverUrl.trim() || undefined,
        allowedPlans: plForm.allowedPlan === "all" ? ["all"] : [plForm.allowedPlan],
      } as any,
    });
  };

  const handleEditPlSubmit = () => {
    if (!editPlTarget || !editPlTarget.name.trim()) return;
    updatePl.mutate({
      playlistId: editPlTarget.id,
      data: {
        name: editPlTarget.name.trim(),
        genre: editPlTarget.genre?.trim() || "Variado",
        coverUrl: editPlTarget.coverUrl || undefined,
        allowedPlans: editPlTarget.allowedPlan === "all" ? ["all"] : [editPlTarget.allowedPlan],
        playbackMode: editPlTarget.playbackMode || "sequential",
      } as any,
    });
  };

  // ── Central Music Files Upload ──
  const handleMusicFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const items: UploadItem[] = Array.from(files).map((f) => ({
      file: f,
      title: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim(),
      type: "music",
      progress: 0,
      status: "queued" as const,
    }));
    setMusicUploadItems(items);
  };

  const uploadSingleMusic = async (item: UploadItem, idx: number): Promise<void> => {
    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("title", item.title);
    formData.append("type", "music");
    formData.append("clientId", "1"); // Global catalog

    setMusicUploadItems((prev) => prev.map((u, i) => (i === idx ? { ...u, status: "uploading", progress: 10 } : u)));

    try {
      const res = await handleStandaloneRequest("/api/media", "POST", formData, (progress) => {
        setMusicUploadItems((prev) => prev.map((u, i) => (i === idx ? { ...u, progress } : u)));
      });
      if (res.status >= 200 && res.status < 300) {
        setMusicUploadItems((prev) => prev.map((u, i) => (i === idx ? { ...u, status: "done", progress: 100 } : u)));
      } else {
        throw new Error("Erro no upload");
      }
    } catch (err: any) {
      setMusicUploadItems((prev) => prev.map((u, i) => (i === idx ? { ...u, status: "error" } : u)));
      throw err;
    }
  };

  const startMusicUpload = async () => {
    if (!musicUploadItems.length) return;
    setIsMusicUploading(true);
    for (let i = 0; i < musicUploadItems.length; i++) {
      if (musicUploadItems[i]!.status !== "done") {
        try {
          await uploadSingleMusic(musicUploadItems[i]!, i);
        } catch {
          // continue
        }
      }
    }
    setIsMusicUploading(false);
    toast({ title: "Músicas enviadas para o acervo central com sucesso!" });
    invalidateMedia();
  };

  // ── Commercials Handlers ──
  const visibleIds = useMemo(() => new Set((media ?? []).map((m) => m.id)), [media]);
  const visibleSelected = useMemo(
    () => Array.from(selected).filter((id) => visibleIds.has(id)),
    [selected, visibleIds]
  );
  const allVisibleSelected = (media?.length ?? 0) > 0 && visibleSelected.length === (media?.length ?? 0);

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set((media ?? []).map((m) => m.id)));
    }
  };

  const [uploadType, setUploadType] = useState<"music" | "jingle" | "voiceover">("jingle");

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const items: UploadItem[] = Array.from(files).map((f) => ({
      file: f,
      title: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim(),
      type: uploadType,
      progress: 0,
      status: "queued" as const,
    }));
    setUploadItems(items);
  };

  const uploadWithXHR = async (item: UploadItem, clientId: string, idx: number): Promise<void> => {
    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("title", item.title);
    formData.append("type", item.type);
    formData.append("clientId", clientId);
    if (item.type !== "music") {
      formData.append("unitEmails", JSON.stringify(targetAllUnits ? [] : selectedUnitEmails));
    }

    setUploadItems((prev) => prev.map((u, i) => (i === idx ? { ...u, status: "uploading", progress: 10 } : u)));

    try {
      const res = await handleStandaloneRequest("/api/media", "POST", formData, (progress) => {
        setUploadItems((prev) => prev.map((u, i) => (i === idx ? { ...u, progress } : u)));
      });
      if (res.status >= 200 && res.status < 300) {
        setUploadItems((prev) => prev.map((u, i) => (i === idx ? { ...u, status: "done", progress: 100 } : u)));
      } else {
        throw new Error(res.data?.message || "Erro no upload");
      }
    } catch (err: any) {
      setUploadItems((prev) => prev.map((u, i) => (i === idx ? { ...u, status: "error" } : u)));
      throw err;
    }
  };

  const startUpload = async () => {
    if (!uploadClientId || !uploadItems.length) return;
    setIsUploading(true);
    for (let i = 0; i < uploadItems.length; i++) {
      if (uploadItems[i]!.status !== "done") {
        try {
          await uploadWithXHR(uploadItems[i]!, uploadClientId, i);
        } catch {}
      }
    }
    setIsUploading(false);
    toast({ title: "Upload de comerciais concluído" });
    invalidateMedia();
  };

  const formatDuration = (s: number = 0) => {
    const total = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(total / 60);
    const sec = Math.floor(total % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Filtered global playlists for tab 1
  const filteredGlobalPlaylists = useMemo(() => {
    if (!globalPlaylists) return [];
    return globalPlaylists.filter((p: any) => {
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
  }, [globalPlaylists, playlistGenreFilter, playlistSearch]);

  const uniqueGenres = useMemo(() => {
    if (!globalPlaylists) return [];
    const set = new Set<string>();
    globalPlaylists.forEach((p: any) => {
      if (p.genre) set.add(p.genre);
    });
    return Array.from(set);
  }, [globalPlaylists]);

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-primary/10 text-primary">
              <Music className="w-6 h-6" />
            </span>
            <span>Biblioteca & Acervo</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão completa do acervo musical global com capas de álbum e comerciais segmentados por clientes.
          </p>
        </div>

        {activeTab === "playlists" ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMusicUploadItems([]);
                setUploadMusicOpen(true);
              }}
              className="gap-2 border-primary/30 hover:bg-primary/5"
            >
              <Upload className="w-4 h-4 text-primary" />
              <span>+ Músicas p/ Acervo</span>
            </Button>
            <Button
              onClick={() => setCreatePlOpen(true)}
              className="gap-2 shadow-md bg-primary hover:bg-primary/90"
              data-testid="button-create-album"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Playlist Musical</span>
            </Button>
          </div>
        ) : (
          <Button
            data-testid="button-upload-commercial"
            onClick={() => {
              setUploadClientId(clientFilter || "");
              setUploadType("jingle");
              setUploadOpen(true);
            }}
            className="gap-2 shadow-md"
          >
            <Upload className="w-4 h-4" />
            <span>Enviar Comerciais / Jingles</span>
          </Button>
        )}
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-border mb-6 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("playlists")}
          className={cn(
            "pb-3.5 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer",
            activeTab === "playlists"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ListMusic className="w-4 h-4" />
          <span>🎵 Playlists Musicais & Álbuns (Acervo Global)</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
            {globalPlaylists?.length ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("commercials")}
          className={cn(
            "pb-3.5 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer",
            activeTab === "commercials"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Mic className="w-4 h-4" />
          <span>📢 Comerciais & Locuções dos Clientes</span>
          {media?.length ? (
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
              {media.length}
            </span>
          ) : null}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: PLAYLISTS MUSICAIS & ÁLBUNS (ACERVO GLOBAL COM CAPAS)
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "playlists" && (
        <div className="space-y-6">
          {/* Banner explicativo B2B Streaming */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Catálogo de Estilos & Álbuns Musicais
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                As playlists musicais criadas aqui ficam disponíveis no terminal do <strong>Player</strong> para que o lojista escolha qual estilo deseja sintonizar, de acordo com o plano contratado (Standard ou Master).
              </p>
            </div>
            <div className="flex items-center gap-2 flex-none">
              <Link href="/player" target="_blank">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs text-primary border-primary/30">
                  <Play className="w-3.5 h-3.5" /> Abrir Player
                </Button>
              </Link>
            </div>
          </div>

          {/* Search & Genre Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar playlist ou gênero..."
                value={playlistSearch}
                onChange={(e) => setPlaylistSearch(e.target.value)}
                className="pl-9 text-xs"
              />
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
                Todos
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
              <h3 className="text-base font-semibold text-foreground">Nenhuma playlist encontrada</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
                Crie playlists musicais temáticas (como Pop, Rock, Lounge, Sertanejo) com foto de capa para que seus clientes possam sintonizar.
              </p>
              <Button onClick={() => setCreatePlOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Criar Primeira Playlist
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
                    <div className="relative aspect-square bg-muted overflow-hidden">
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

                      {/* Hover Overlay Button to Manage Songs */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-4">
                        <Link href={`/playlists/${pl.id}`}>
                          <Button size="sm" className="gap-1.5 shadow-lg bg-primary hover:bg-primary/90 text-xs">
                            <ListMusic className="w-3.5 h-3.5" /> Gerenciar Faixas
                          </Button>
                        </Link>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <h4 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                          {pl.name}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {pl.itemCount ?? 0} {pl.itemCount === 1 ? "música" : "músicas cadastradas"}
                        </p>
                      </div>

                      {/* Action Bar */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                        <Link href={`/playlists/${pl.id}`}>
                          <button
                            type="button"
                            className="text-primary hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Ver faixas</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </Link>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title="Editar capa e detalhes"
                            onClick={() => {
                              const plan = pl.allowedPlans && pl.allowedPlans.length === 1 ? pl.allowedPlans[0] : "all";
                              setEditPlTarget({
                                id: pl.id,
                                name: pl.name,
                                genre: pl.genre || "Pop",
                                coverUrl: pl.coverUrl || "",
                                allowedPlan: plan,
                                playbackMode: pl.playbackMode || "sequential",
                              });
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            title="Excluir playlist"
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
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: COMERCIAIS & LOCUÇÕES DOS CLIENTES (JINGLES / VINHETAS)
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "commercials" && (
        <div className="space-y-4">
          {/* Client & Type Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-52" data-testid="select-client-filter">
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

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40" data-testid="select-type-filter">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os comerciais</SelectItem>
                <SelectItem value="jingle">🔔 Jingles</SelectItem>
                <SelectItem value="voiceover">🎙️ Locuções</SelectItem>
                <SelectItem value="music">🎵 Músicas do cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!clientFilter && (
            <div className="bg-card border rounded-xl p-12 text-center text-muted-foreground">
              Selecione um cliente acima para visualizar e gerenciar os comerciais.
            </div>
          )}

          {/* Bulk Action Bar */}
          {visibleSelected.length > 0 && (
            <div
              data-testid="bulk-action-bar"
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg"
            >
              <span className="text-sm text-foreground">
                <strong>{visibleSelected.length}</strong> selecionada(s)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-50"
                  onClick={async () => {
                    await handleStandaloneRequest("/api/media/batch-update-type", "POST", { ids: visibleSelected, type: "jingle" });
                    toast({ title: "Alterado para Jingle" });
                    invalidateMedia();
                    setSelected(new Set());
                  }}
                >
                  🔔 Jingle
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs border-purple-500/30 text-purple-600 hover:bg-purple-50"
                  onClick={async () => {
                    await handleStandaloneRequest("/api/media/batch-update-type", "POST", { ids: visibleSelected, type: "voiceover" });
                    toast({ title: "Alterado para Locução" });
                    invalidateMedia();
                    setSelected(new Set());
                  }}
                >
                  🎙️ Locução
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set())}
                >
                  Limpar seleção
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  data-testid="button-bulk-delete"
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Excluir
                </Button>
              </div>
            </div>
          )}

          {/* Commercials Table */}
          <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-5 py-3 w-10">
                      <button
                        type="button"
                        data-testid="button-toggle-all"
                        onClick={toggleAll}
                        disabled={!media?.length}
                        className="flex items-center justify-center text-muted-foreground hover:text-primary disabled:opacity-40"
                      >
                        {allVisibleSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Título</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Destino / Filiais</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Duração</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mediaLoading && (
                    [...Array(3)].map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-4 bg-muted animate-pulse rounded" /></td></tr>
                    ))
                  )}
                  {Array.isArray(media) && media.map((m) => {
                    const isChecked = selected.has(m.id);
                    const badgeConfig =
                      m.type === "jingle"
                        ? { label: "Jingle", bg: "bg-amber-500/10 text-amber-600 border border-amber-500/20", icon: <Mic className="w-3 h-3" /> }
                        : m.type === "voiceover"
                        ? { label: "Locução", bg: "bg-purple-500/10 text-purple-600 border border-purple-500/20", icon: <Mic className="w-3 h-3" /> }
                        : { label: "Música", bg: "bg-blue-500/10 text-blue-600 border border-blue-500/20", icon: <Music className="w-3 h-3" /> };

                    return (
                      <tr key={m.id} className={cn("hover:bg-muted/30 transition-colors", isChecked && "bg-primary/5")}>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => toggleOne(m.id)}
                            className="flex items-center justify-center text-muted-foreground hover:text-primary"
                          >
                            {isChecked ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn("inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium", badgeConfig.bg)}>
                            {badgeConfig.icon}
                            {badgeConfig.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-medium text-foreground">{m.title}</td>
                        <td className="px-5 py-4">
                          {m.type === "music" ? (
                            <span className="text-xs text-muted-foreground">–</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTargetMedia(m);
                                setEditingUnitEmails(Array.isArray((m as any).unitEmails) ? (m as any).unitEmails : []);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium transition-colors hover:opacity-80 cursor-pointer"
                              title="Configurar filiais para este comercial"
                            >
                              {!(m as any).unitEmails || (m as any).unitEmails.length === 0 ? (
                                <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                  <Building2 className="w-3 h-3" /> Todas as filiais
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                                  <MapPin className="w-3 h-3" /> {(m as any).unitEmails.length} filial(is)
                                </span>
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center font-mono text-xs text-muted-foreground">
                          {formatDuration(m.duration)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Excluir comercial"
                            onClick={() => del.mutate({ mediaId: m.id })}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {!mediaLoading && !media?.length && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                        Nenhum comercial ou áudio encontrado para este cliente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: CRIAR NOVA PLAYLIST MUSICAL COM CAPA
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={createPlOpen} onOpenChange={setCreatePlOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Music className="w-5 h-5" />
              </span>
              <span>Criar Nova Playlist Musical (Álbum)</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Nome da Playlist / Álbum *</Label>
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

            {/* Capa da Playlist */}
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
                <span className="text-[11px] text-muted-foreground block mb-2">Ou escolha uma capa temática predefinida:</span>
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
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreatePlOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreatePlSubmit} disabled={createPl.isPending}>
              {createPl.isPending ? "Criando..." : "Criar Playlist Musical"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: EDITAR PLAYLIST MUSICAL
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={!!editPlTarget} onOpenChange={(o) => { if (!o) setEditPlTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Playlist / Álbum</DialogTitle>
          </DialogHeader>

          {editPlTarget && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-semibold">Nome da Playlist</Label>
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
          MODAL: EXCLUIR PLAYLIST
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={!!deletePlTarget} onOpenChange={(o) => { if (!o) setDeletePlTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Playlist Musical?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza de que deseja excluir a playlist <strong>{deletePlTarget?.name}</strong>? As músicas contidas nela continuarão disponíveis no acervo geral.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deletePlTarget && delPl.mutate({ playlistId: deletePlTarget.id })}
              disabled={delPl.isPending}
            >
              {delPl.isPending ? "Excluindo..." : "Excluir Playlist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: UPLOAD MÚSICAS P/ ACERVO CENTRAL
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={uploadMusicOpen} onOpenChange={(o) => { if (!isMusicUploading) setUploadMusicOpen(o); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              <span>Enviar Músicas para o Acervo Central</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Envie arquivos de áudio MP3 que farão parte do catálogo geral. Após o envio, você poderá adicionar essas músicas a qualquer álbum ou playlist.
            </p>

            <input
              ref={musicFileInputRef}
              type="file"
              multiple
              accept="audio/*"
              className="hidden"
              onChange={(e) => handleMusicFilesSelected(e.target.files)}
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => musicFileInputRef.current?.click()}
              className="w-full py-8 border-dashed border-2 flex flex-col items-center gap-2 hover:bg-muted/40"
            >
              <Music className="w-8 h-8 text-primary opacity-75" />
              <span className="text-sm font-semibold">Clique para selecionar arquivos MP3</span>
              <span className="text-xs text-muted-foreground">Você pode selecionar múltiplos arquivos ao mesmo tempo</span>
            </Button>

            {musicUploadItems.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {musicUploadItems.map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-muted/40 rounded-lg border text-xs flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-primary h-full transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">{item.progress}%</span>
                      </div>
                    </div>
                    {item.status === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-none" />}
                    {item.status === "error" && <XCircle className="w-4 h-4 text-destructive flex-none" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadMusicOpen(false)} disabled={isMusicUploading}>
              Fechar
            </Button>
            <Button
              onClick={startMusicUpload}
              disabled={isMusicUploading || musicUploadItems.length === 0 || musicUploadItems.every((u) => u.status === "done")}
            >
              {isMusicUploading ? "Enviando..." : `Enviar ${musicUploadItems.length} Música(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: UPLOAD COMERCIAIS / JINGLES
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!isUploading) { setUploadOpen(o); if (!o) { setUploadItems([]); setUploadClientId(""); } } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              <span>Enviar Comerciais & Locuções</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Cliente da Empresa *</Label>
              <Select
                value={uploadClientId}
                onValueChange={(val) => {
                  setUploadClientId(val);
                  setTargetAllUnits(true);
                  setSelectedUnitEmails([]);
                }}
              >
                <SelectTrigger className="mt-1" data-testid="select-upload-client">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(clients) && clients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Tipo do Comercial</Label>
              <Select
                value={uploadType}
                onValueChange={(v) => {
                  const t = v as "music" | "jingle" | "voiceover";
                  setUploadType(t);
                  setUploadItems((prev) => prev.map((u) => (u.status === "queued" ? { ...u, type: t } : u)));
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jingle">🔔 Jingle</SelectItem>
                  <SelectItem value="voiceover">🎙️ Locução</SelectItem>
                  <SelectItem value="music">🎵 Música do Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {uploadClientId && (uploadType !== "music" || uploadItems.some((u) => u.type !== "music")) && (() => {
              const selectedClient = clients?.find((c) => String(c.id) === uploadClientId);
              const units = selectedClient?.units || [];
              if (!units.length) return null;

              return (
                <div className="p-3 bg-muted/40 rounded-xl border space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-primary" />
                      Destino das Filiais
                    </Label>
                    <span className="text-[10px] text-muted-foreground">{units.length} filiais cadastradas</span>
                  </div>
                  <div className="flex gap-4 text-xs pt-1">
                    <label className="flex items-center gap-2 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="targetUnitsUpload"
                        checked={targetAllUnits}
                        onChange={() => setTargetAllUnits(true)}
                        className="accent-primary"
                      />
                      <span>🏢 Todas as filiais</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="targetUnitsUpload"
                        checked={!targetAllUnits}
                        onChange={() => {
                          setTargetAllUnits(false);
                          if (selectedUnitEmails.length === 0) {
                            setSelectedUnitEmails(units.map((u: any) => u.email.toLowerCase()));
                          }
                        }}
                        className="accent-primary"
                      />
                      <span>📍 Filiais selecionadas</span>
                    </label>
                  </div>

                  {!targetAllUnits && (
                    <div className="mt-2 pt-2 border-t space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {units.map((u: any) => {
                        const email = u.email.toLowerCase();
                        const isChecked = selectedUnitEmails.includes(email);
                        return (
                          <label key={email} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted border cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedUnitEmails((prev) =>
                                  isChecked ? prev.filter((e) => e !== email) : [...prev, email]
                                );
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
              );
            })()}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/*"
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!uploadClientId}
              className="w-full py-6 border-dashed border-2 flex flex-col items-center gap-1 hover:bg-muted/40"
            >
              <Mic className="w-6 h-6 text-primary opacity-75" />
              <span className="text-xs font-semibold">Selecionar Áudios para Envio</span>
            </Button>

            {uploadItems.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {uploadItems.map((item, idx) => (
                  <div key={idx} className="p-2 bg-muted/40 rounded-lg border text-xs flex items-center justify-between gap-2">
                    <span className="truncate flex-1 font-medium">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{item.progress}%</span>
                    {item.status === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-none" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={isUploading}>Cancelar</Button>
            <Button onClick={startUpload} disabled={isUploading || !uploadItems.length}>
              {isUploading ? "Enviando..." : `Enviar ${uploadItems.length} Arquivo(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: CONFIGURAR FILIAIS DE UM COMERCIAL
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={!!editingTargetMedia} onOpenChange={(o) => { if (!o) setEditingTargetMedia(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <span>Destino nas Filiais</span>
            </DialogTitle>
          </DialogHeader>

          {editingTargetMedia && (() => {
            const client = clients?.find((c) => c.id === editingTargetMedia.clientId);
            const units = client?.units || [];

            return (
              <div className="space-y-4 py-2">
                <div className="p-3 bg-muted/30 rounded-lg border">
                  <p className="text-xs font-semibold truncate">{editingTargetMedia.title}</p>
                  <p className="text-[11px] text-muted-foreground">{client?.name}</p>
                </div>

                {units.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Este cliente não possui filiais cadastradas. O comercial tocará em todas as estações deste cliente.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-4 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer font-medium">
                        <input
                          type="radio"
                          name="editTargetingUnits"
                          checked={editingUnitEmails.length === 0}
                          onChange={() => setEditingUnitEmails([])}
                          className="accent-primary"
                        />
                        <span>🏢 Todas as filiais</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer font-medium">
                        <input
                          type="radio"
                          name="editTargetingUnits"
                          checked={editingUnitEmails.length > 0}
                          onChange={() => {
                            if (editingUnitEmails.length === 0) {
                              setEditingUnitEmails(units.map((u: any) => u.email.toLowerCase()));
                            }
                          }}
                          className="accent-primary"
                        />
                        <span>📍 Filiais selecionadas</span>
                      </label>
                    </div>

                    {editingUnitEmails.length > 0 && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 border rounded-lg p-2">
                        {units.map((u: any) => {
                          const email = u.email.toLowerCase();
                          const isChecked = editingUnitEmails.includes(email);
                          return (
                            <label key={email} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setEditingUnitEmails((prev) =>
                                    isChecked ? prev.filter((e) => e !== email) : [...prev, email]
                                  );
                                }}
                                className="accent-primary"
                              />
                              <span className="font-medium">{u.name}</span>
                              <span className="text-muted-foreground text-[10px] font-mono">({email})</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTargetMedia(null)}>Cancelar</Button>
            <Button
              disabled={isSavingTargeting}
              onClick={async () => {
                if (!editingTargetMedia) return;
                setIsSavingTargeting(true);
                try {
                  await handleStandaloneRequest(`/api/media/${editingTargetMedia.id}`, "PUT", {
                    unitEmails: editingUnitEmails,
                  });
                  toast({ title: "Filiais configuradas com sucesso!" });
                  invalidateMedia();
                  setEditingTargetMedia(null);
                } catch {
                  toast({ title: "Erro ao atualizar filiais", variant: "destructive" });
                } finally {
                  setIsSavingTargeting(false);
                }
              }}
            >
              {isSavingTargeting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: EXCLUSÃO EM MASSA DE COMERCIAIS
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir mídias selecionadas?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Você está prestes a remover <strong>{visibleSelected.length}</strong> mídia(s). Esta ação é irreversível.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulkDelete(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={delBatch.isPending}
              onClick={() => delBatch.mutate({ data: { mediaIds: visibleSelected } })}
            >
              {delBatch.isPending ? "Excluindo..." : `Excluir ${visibleSelected.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
