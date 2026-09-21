import { useState, useRef, useMemo, useEffect } from "react";
import { Upload, Trash2, Music, Mic, Filter, CheckSquare, Square, Clock, Loader2, CheckCircle2, XCircle, RotateCw, X, Building2, MapPin } from "lucide-react";
import {
  useListMedia, getListMediaQueryKey,
  useDeleteMedia, useDeleteMediaBatch,
  useListClients, getListClientsQueryKey,
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

export default function MediaPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
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

  const { data: clients } = useListClients({ query: { queryKey: getListClientsQueryKey() } });

  useEffect(() => {
    if (!clientFilter && Array.isArray(clients) && clients.length > 0) {
      setClientFilter(String(clients[0]!.id));
    }
  }, [clients, clientFilter]);

  const mediaParams: { clientId?: number; type?: "music" | "jingle" | "voiceover" } = {};
  if (clientFilter) mediaParams.clientId = parseInt(clientFilter);
  if (typeFilter !== "all") mediaParams.type = typeFilter as "music" | "jingle" | "voiceover";

  const { data: media, isLoading } = useListMedia(mediaParams, { query: { queryKey: getListMediaQueryKey(mediaParams), enabled: !!clientFilter } });

  const invalidateMedia = () => qc.invalidateQueries({ queryKey: getListMediaQueryKey() });

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

  // Keep selection in sync — drop ids that are no longer visible after a filter change
  const visibleIds = useMemo(() => new Set((media ?? []).map((m) => m.id)), [media]);
  const visibleSelected = useMemo(
    () => Array.from(selected).filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
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

  const [uploadType, setUploadType] = useState<"music" | "jingle" | "voiceover">("music");

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const initialType = uploadType;
    const items: UploadItem[] = Array.from(files).map((f) => ({
      file: f,
      title: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim(),
      type: initialType,
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
        return;
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
    const pending = uploadItems.map((u, i) => ({ u, i })).filter(({ u }) => u.status === "queued" || u.status === "error");
    let errorCount = 0;

    for (const { u, i: idx } of pending) {
      try {
        await uploadWithXHR(u, uploadClientId, idx);
      } catch (e) {
        errorCount++;
        console.warn("Upload item error:", e);
      }
    }

    setIsUploading(false);
    qc.invalidateQueries({ queryKey: getListMediaQueryKey() });
    qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
    invalidateMedia();

    if (errorCount > 0) {
      toast({ title: `Upload finalizado com ${errorCount} erro(s)`, variant: "destructive" });
    } else {
      toast({ title: "Upload concluído com sucesso" });
      setTimeout(() => {
        setUploadOpen(false);
        setUploadItems([]);
        if (!clientFilter && uploadClientId) {
          setClientFilter(uploadClientId);
        }
      }, 500);
    }
  };

  const retryItem = async (idx: number) => {
    const item = uploadItems[idx];
    if (!item || !uploadClientId) return;
    try { await uploadWithXHR({ ...item, progress: 0 }, uploadClientId, idx); invalidateMedia(); } catch { /* status já marcado como erro */ }
  };

  const removeItem = (idx: number) => {
    setUploadItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const overallProgress = uploadItems.length ? Math.round(uploadItems.reduce((sum, u) => sum + u.progress, 0) / uploadItems.length) : 0;
  const formatDuration = (secs?: number | null) => { if (!secs) return "–"; const m = Math.floor(secs / 60); const s = Math.round(secs % 60); return `${m}:${s.toString().padStart(2, "0")}`; };

  const selectedCount = visibleSelected.length;

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Biblioteca de Mídias</h1>
          <p className="text-sm text-muted-foreground mt-1">{media?.length ?? 0} arquivos</p>
        </div>
        <Button
          data-testid="button-upload"
          onClick={() => {
            setUploadClientId(clientFilter || "");
            setUploadOpen(true);
          }}
        >
          <Upload className="w-4 h-4 mr-2" /> Enviar Mídias
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-44" data-testid="select-client-filter"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
            <SelectContent>
              {Array.isArray(clients) && clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40" data-testid="select-type-filter"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="music">🎵 Música</SelectItem>
            <SelectItem value="jingle">🔔 Jingle</SelectItem>
            <SelectItem value="voiceover">🎙️ Locução</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!clientFilter && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center text-muted-foreground mb-6">
          Selecione um cliente acima para ver as midias.
        </div>
      )}

      {/* Bulk action bar — appears when items are selected */}
      {selectedCount > 0 && (
        <div
          data-testid="bulk-action-bar"
          className="flex flex-wrap items-center justify-between gap-3 mb-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg"
        >
          <span className="text-sm text-foreground">
            <strong>{selectedCount}</strong> {selectedCount === 1 ? "mídia selecionada" : "mídias selecionadas"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Mover para:</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-blue-500/30 text-blue-600 hover:bg-blue-50"
              onClick={async () => {
                await handleStandaloneRequest("/api/media/batch-update-type", "POST", { ids: visibleSelected, type: "music" });
                toast({ title: `${selectedCount} mídia(s) alterada(s) para Música` });
                invalidateMedia();
                setSelected(new Set());
              }}
            >
              🎵 Música
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-50"
              onClick={async () => {
                await handleStandaloneRequest("/api/media/batch-update-type", "POST", { ids: visibleSelected, type: "jingle" });
                toast({ title: `${selectedCount} mídia(s) alterada(s) para Jingle` });
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
                toast({ title: `${selectedCount} mídia(s) alterada(s) para Locução` });
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
              data-testid="button-clear-selection"
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

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-card-border bg-muted/30">
              <th className="px-5 py-3 w-10">
                <button
                  type="button"
                  data-testid="button-toggle-all"
                  onClick={toggleAll}
                  disabled={!media?.length}
                  title={allVisibleSelected ? "Desmarcar todas" : "Selecionar todas"}
                  className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {allVisibleSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                </button>
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Título</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Destino / Filiais</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Artista</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Duração</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Ganho</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && [...Array(5)].map((_, i) => <tr key={i}><td colSpan={8} className="px-5 py-4"><div className="h-4 bg-muted animate-pulse rounded" /></td></tr>)}
            {Array.isArray(media) && media.map((m) => {
              const isChecked = selected.has(m.id);
              const badgeConfig =
                m.type === "jingle"
                  ? { label: "Jingle", bg: "bg-amber-500/10 text-amber-600 border border-amber-500/20", icon: <Mic className="w-3 h-3" /> }
                  : m.type === "voiceover"
                  ? { label: "Locução", bg: "bg-purple-500/10 text-purple-600 border border-purple-500/20", icon: <Mic className="w-3 h-3" /> }
                  : { label: "Música", bg: "bg-blue-500/10 text-blue-600 border border-blue-500/20", icon: <Music className="w-3 h-3" /> };

              return (
                <tr
                  key={m.id}
                  data-testid={`row-media-${m.id}`}
                  className={cn(
                    "transition-colors",
                    isChecked ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/20",
                  )}
                >
                  <td className="px-5 py-4">
                    <input
                      type="checkbox"
                      data-testid={`checkbox-media-${m.id}`}
                      checked={isChecked}
                      onChange={() => toggleOne(m.id)}
                      className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                    />
                  </td>
                  <td className="px-5 py-4">
                    <Select
                      value={m.type}
                      onValueChange={async (val) => {
                        await handleStandaloneRequest(`/api/media/${m.id}`, "PATCH", { type: val });
                        toast({ title: `Tipo alterado para ${val === "music" ? "Música" : val === "jingle" ? "Jingle" : "Locução"}` });
                        invalidateMedia();
                      }}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs border-0 bg-transparent p-0 focus:ring-0 shadow-none">
                        <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium cursor-pointer", badgeConfig.bg)}>
                          {badgeConfig.icon}
                          {badgeConfig.label}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="music">🎵 Música</SelectItem>
                        <SelectItem value="jingle">🔔 Jingle</SelectItem>
                        <SelectItem value="voiceover">🎙️ Locução</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-5 py-4 font-medium text-foreground">{m.title}</td>
                  <td className="px-5 py-4">
                    {m.type === "music" ? (
                      <span className="text-xs text-muted-foreground/50">–</span>
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
                  <td className="px-5 py-4 text-muted-foreground">{m.artist ?? "–"}</td>
                  <td className="px-5 py-4 text-center font-mono text-xs text-muted-foreground">{formatDuration(m.duration)}</td>
                  <td className="px-5 py-4 text-center text-xs text-muted-foreground">{m.gain?.toFixed(1) ?? "1.0"}</td>
                  <td className="px-5 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Excluir esta mídia"
                      data-testid={`button-delete-media-${m.id}`}
                      onClick={() => del.mutate({ mediaId: m.id })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && !media?.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">Nenhuma mídia encontrada</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {/* Bulk delete confirmation */}
      <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir mídias selecionadas?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Você está prestes a remover <strong>{selectedCount}</strong> {selectedCount === 1 ? "arquivo" : "arquivos"} de áudio. Esta ação é permanente e os arquivos serão apagados do servidor.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulkDelete(false)} disabled={delBatch.isPending}>Cancelar</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-bulk-delete"
              disabled={delBatch.isPending}
              onClick={() => delBatch.mutate({ data: { mediaIds: visibleSelected } })}
            >
              {delBatch.isPending ? "Excluindo..." : `Excluir ${selectedCount}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!isUploading) { setUploadOpen(o); if (!o) { setUploadItems([]); setUploadClientId(""); } } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap" data-testid="title-upload-dialog">
              <span>Enviar Mídias</span>
              {uploadClientId && clients?.find((c) => String(c.id) === uploadClientId) && (
                <span
                  className="inline-flex items-center text-xs px-2 py-0.5 rounded font-medium bg-muted text-muted-foreground"
                  data-testid="badge-upload-client"
                >
                  {clients.find((c) => String(c.id) === uploadClientId)?.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>
                Cliente <span className="text-destructive">*</span>
              </Label>
              <Select
                value={uploadClientId}
                onValueChange={(val) => {
                  setUploadClientId(val);
                  setTargetAllUnits(true);
                  setSelectedUnitEmails([]);
                }}
              >
                <SelectTrigger data-testid="select-upload-client"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>{Array.isArray(clients) && clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {!uploadClientId && (
                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                  ⚠️ Escolha um cliente para poder enviar mídias.
                </p>
              )}
            </div>

            <div>
              <Label>Tipo padrão dos arquivos</Label>
              <Select
                value={uploadType}
                onValueChange={(v) => {
                  const t = v as "music" | "jingle" | "voiceover";
                  setUploadType(t);
                  setUploadItems((prev) => prev.map((u) => (u.status === "queued" ? { ...u, type: t } : u)));
                }}
              >
                <SelectTrigger data-testid="select-default-upload-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="music">🎵 Música</SelectItem>
                  <SelectItem value="jingle">🔔 Jingle</SelectItem>
                  <SelectItem value="voiceover">🎙️ Locução</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {uploadClientId && (uploadType !== "music" || uploadItems.some((u) => u.type !== "music")) && (() => {
              const selectedClient = clients?.find((c) => String(c.id) === uploadClientId);
              const units = selectedClient?.units || [];
              if (!units.length) return null;

              return (
                <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Building2 className="w-3.5 h-3.5 text-primary" />
                      Destino dos Jingles / Locuções nas Filiais
                    </Label>
                    <span className="text-[10px] text-muted-foreground">{units.length} filiais cadastradas</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Defina se estes comerciais tocarão em toda a rede deste cliente ou somente em filiais específicas (ex: horários ou promoções locais).
                  </p>
                  <div className="flex gap-4 text-xs pt-1">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                      <input
                        type="radio"
                        name="targetUnitsUpload"
                        checked={targetAllUnits}
                        onChange={() => setTargetAllUnits(true)}
                        className="accent-primary"
                      />
                      <span>🏢 Todas as filiais (Rede Inteira)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
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
                    <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1">
                        <span>Selecione as filiais:</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => setSelectedUnitEmails(units.map((u: any) => u.email.toLowerCase()))}
                          >
                            Marcar todas
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => setSelectedUnitEmails([])}
                          >
                            Limpar
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {units.map((u: any) => {
                          const email = u.email.toLowerCase();
                          const isChecked = selectedUnitEmails.includes(email);
                          return (
                            <label key={email} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted border border-border/50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedUnitEmails((prev) =>
                                    isChecked ? prev.filter((e) => e !== email) : [...prev, email]
                                  );
                                }}
                                className="rounded accent-primary"
                              />
                              <div className="truncate">
                                <span className="font-medium text-foreground">{u.name}</span>
                                <span className="text-[10px] text-muted-foreground block truncate">{u.email}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                uploadClientId
                  ? "border-border cursor-pointer hover:border-primary"
                  : "border-border/50 bg-muted/20 cursor-not-allowed opacity-60",
              )}
              onClick={() => { if (uploadClientId) fileInputRef.current?.click(); }}
              data-testid="upload-dropzone"
            >
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {uploadClientId
                  ? "Clique para selecionar arquivos de áudio"
                  : "Selecione um cliente acima primeiro"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">MP3, AAC, WAV, OGG — até 200MB cada</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="audio/*"
                className="hidden"
                disabled={!uploadClientId}
                data-testid="input-files"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
            </div>

            {uploadItems.length > 0 && (() => {
              const doneCount = uploadItems.filter((u) => u.status === "done").length;
              const errorCount = uploadItems.filter((u) => u.status === "error").length;
              const uploadingCount = uploadItems.filter((u) => u.status === "uploading").length;
              const queuedCount = uploadItems.filter((u) => u.status === "queued").length;
              return (
                <div className="space-y-3">
                  {/* Overall progress + counters */}
                  <div className="bg-muted/40 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">
                        {doneCount} de {uploadItems.length} enviados
                      </span>
                      <span className="font-mono text-muted-foreground">{overallProgress}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full transition-all", errorCount > 0 && doneCount + errorCount === uploadItems.length ? "bg-destructive" : "bg-primary")}
                        style={{ width: `${overallProgress}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {queuedCount > 0 && <span className="text-muted-foreground inline-flex items-center gap-1"><Clock className="w-3 h-3" />{queuedCount} na fila</span>}
                      {uploadingCount > 0 && <span className="text-primary inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{uploadingCount} enviando</span>}
                      {doneCount > 0 && <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{doneCount} concluídos</span>}
                      {errorCount > 0 && <span className="text-destructive inline-flex items-center gap-1"><XCircle className="w-3 h-3" />{errorCount} com erro</span>}
                    </div>
                  </div>

                  {/* Per-item list */}
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {uploadItems.map((item, i) => (
                      <div
                        key={i}
                        data-testid={`upload-item-${i}`}
                        className={cn(
                          "rounded-lg p-3 border transition-colors",
                          item.status === "done" && "bg-emerald-500/5 border-emerald-500/30",
                          item.status === "error" && "bg-destructive/5 border-destructive/30",
                          item.status === "uploading" && "bg-primary/5 border-primary/30",
                          item.status === "queued" && "bg-muted/40 border-border",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {/* Status icon — always visible */}
                          <div className="shrink-0 w-5 flex items-center justify-center" data-testid={`status-icon-${i}`}>
                            {item.status === "queued" && <Clock className="w-4 h-4 text-muted-foreground" />}
                            {item.status === "uploading" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                            {item.status === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                            {item.status === "error" && <XCircle className="w-4 h-4 text-destructive" />}
                          </div>
                          <Input
                            value={item.title}
                            onChange={(e) => setUploadItems((prev) => prev.map((u, j) => j === i ? { ...u, title: e.target.value } : u))}
                            disabled={item.status === "uploading" || item.status === "done"}
                            className="h-7 text-xs flex-1"
                            data-testid={`input-title-${i}`}
                          />
                          <Select
                            value={item.type}
                            onValueChange={(v) => setUploadItems((prev) => prev.map((u, j) => j === i ? { ...u, type: v as "music" | "jingle" | "voiceover" } : u))}
                            disabled={item.status === "uploading" || item.status === "done"}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs" data-testid={`select-type-${i}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="music">🎵 Música</SelectItem>
                              <SelectItem value="jingle">🔔 Jingle</SelectItem>
                              <SelectItem value="voiceover">🎙️ Locução</SelectItem>
                            </SelectContent>
                          </Select>
                          {/* Action button on the right */}
                          {item.status === "error" && !isUploading && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => retryItem(i)}
                              data-testid={`button-retry-${i}`}
                              title="Tentar enviar novamente"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!isUploading && item.status !== "done" && (
                            <button
                              type="button"
                              onClick={() => removeItem(i)}
                              className="text-muted-foreground hover:text-destructive p-1"
                              data-testid={`button-remove-${i}`}
                              title="Remover da lista"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {/* Progress bar + status text */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full transition-all",
                                item.status === "error" && "bg-destructive",
                                item.status === "done" && "bg-emerald-500",
                                (item.status === "uploading" || item.status === "queued") && "bg-primary",
                              )}
                              style={{ width: `${item.status === "done" ? 100 : item.progress}%` }}
                            />
                          </div>
                          <span
                            className={cn(
                              "text-xs font-mono shrink-0 min-w-[3.5rem] text-right",
                              item.status === "queued" && "text-muted-foreground",
                              item.status === "uploading" && "text-primary",
                              item.status === "done" && "text-emerald-600",
                              item.status === "error" && "text-destructive",
                            )}
                            data-testid={`status-text-${i}`}
                          >
                            {item.status === "done" && "Concluído"}
                            {item.status === "error" && "Falhou"}
                            {item.status === "uploading" && `${item.progress}%`}
                            {item.status === "queued" && "Aguardando"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={isUploading}>
                {uploadItems.some((u) => u.status === "done") && !isUploading ? "Fechar" : "Cancelar"}
              </Button>
              <Button data-testid="button-start-upload" onClick={startUpload} disabled={!uploadClientId || !uploadItems.length || isUploading}>
                {isUploading
                  ? "Enviando..."
                  : uploadItems.some((u) => u.status === "error")
                    ? `Tentar novamente (${uploadItems.filter((u) => u.status === "error" || u.status === "queued").length})`
                    : `Enviar ${uploadItems.filter((u) => u.status === "queued").length || uploadItems.length} arquivo(s)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição de Segmentação de Filiais para Jingle / Locução */}
      <Dialog open={!!editingTargetMedia} onOpenChange={(o) => { if (!o) setEditingTargetMedia(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <span>Destino da Mídia nas Filiais</span>
            </DialogTitle>
          </DialogHeader>
          {editingTargetMedia && (() => {
            const client = clients?.find((c) => c.id === editingTargetMedia.clientId);
            const units = client?.units || [];
            const isAll = editingUnitEmails.length === 0;

            return (
              <div className="space-y-4">
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1 border border-border">
                  <p className="font-semibold text-foreground truncate">{editingTargetMedia.title}</p>
                  <p className="text-muted-foreground">Cliente: <strong>{client?.name || "–"}</strong></p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Onde tocar este {editingTargetMedia.type === "jingle" ? "jingle" : "locução"}?</Label>
                  <div className="flex gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                      <input
                        type="radio"
                        name="editTargetUnitsRadio"
                        checked={isAll}
                        onChange={() => setEditingUnitEmails([])}
                        className="accent-primary"
                      />
                      <span>🏢 Todas as filiais (Rede)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                      <input
                        type="radio"
                        name="editTargetUnitsRadio"
                        checked={!isAll}
                        onChange={() => {
                          if (units.length > 0 && editingUnitEmails.length === 0) {
                            setEditingUnitEmails(units.map((u: any) => u.email.toLowerCase()));
                          }
                        }}
                        className="accent-primary"
                      />
                      <span>📍 Filiais específicas</span>
                    </label>
                  </div>
                </div>

                {!isAll && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Selecione as filiais autorizadas:</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-primary hover:underline text-xs"
                          onClick={() => setEditingUnitEmails(units.map((u: any) => u.email.toLowerCase()))}
                        >
                          Marcar todas
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          className="text-primary hover:underline text-xs"
                          onClick={() => setEditingUnitEmails([])}
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                    {units.length === 0 ? (
                      <p className="text-xs text-amber-600 bg-amber-500/10 p-2.5 rounded border border-amber-500/20">
                        Este cliente ainda não possui filiais cadastradas na aba "Clientes". O áudio tocará em todos os dispositivos da conta.
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 border border-border rounded-lg p-2">
                        {units.map((u: any) => {
                          const email = u.email.toLowerCase();
                          const isChecked = editingUnitEmails.includes(email);
                          return (
                            <label key={email} className="flex items-center gap-2 text-xs p-2 rounded hover:bg-muted cursor-pointer border border-border/40">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setEditingUnitEmails((prev) =>
                                    isChecked ? prev.filter((e) => e !== email) : [...prev, email]
                                  );
                                }}
                                className="rounded accent-primary"
                              />
                              <div className="truncate">
                                <span className="font-medium text-foreground">{u.name}</span>
                                <span className="text-[10px] text-muted-foreground block truncate">{u.email}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setEditingTargetMedia(null)} disabled={isSavingTargeting}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={isSavingTargeting}
                    onClick={async () => {
                      setIsSavingTargeting(true);
                      try {
                        await handleStandaloneRequest(`/api/media/${editingTargetMedia.id}`, "PATCH", {
                          unitEmails: editingUnitEmails,
                        });
                        toast({ title: "Filiais da mídia atualizadas com sucesso!" });
                        invalidateMedia();
                        setEditingTargetMedia(null);
                      } catch (err) {
                        toast({ title: "Erro ao salvar filiais da mídia", variant: "destructive" });
                      } finally {
                        setIsSavingTargeting(false);
                      }
                    }}
                  >
                    {isSavingTargeting ? "Salvando..." : "Salvar Destino"}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
