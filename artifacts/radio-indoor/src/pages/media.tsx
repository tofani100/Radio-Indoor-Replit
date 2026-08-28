import { useState, useRef, useMemo, useEffect } from "react";
import { Upload, Trash2, Music, Mic, Filter, CheckSquare, Square, Clock, Loader2, CheckCircle2, XCircle, RotateCw, X } from "lucide-react";
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

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const defaultType: "music" | "jingle" | "voiceover" =
      typeFilter === "jingle" ? "jingle" : typeFilter === "voiceover" ? "voiceover" : "music";
    const items: UploadItem[] = Array.from(files).map((f) => ({
      file: f,
      title: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim(),
      type: defaultType,
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
          className="flex items-center justify-between gap-3 mb-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg"
        >
          <span className="text-sm text-foreground">
            <strong>{selectedCount}</strong> {selectedCount === 1 ? "mídia selecionada" : "mídias selecionadas"}
          </span>
          <div className="flex gap-2">
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
              Excluir selecionadas
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
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Artista</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Duração</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Ganho</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && [...Array(5)].map((_, i) => <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-muted animate-pulse rounded" /></td></tr>)}
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
                    <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium", badgeConfig.bg)}>
                      {badgeConfig.icon}
                      {badgeConfig.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-medium text-foreground">{m.title}</td>
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
            {!isLoading && !media?.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Nenhuma mídia encontrada</td></tr>}
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
              <Select value={uploadClientId} onValueChange={setUploadClientId}>
                <SelectTrigger data-testid="select-upload-client"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>{Array.isArray(clients) && clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {!uploadClientId && (
                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                  ⚠️ Escolha um cliente para poder enviar mídias.
                </p>
              )}
            </div>
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
    </div>
  );
}
