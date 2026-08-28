import { useState } from "react";
import { BarChart2, Users, ChevronDown, ChevronRight } from "lucide-react";
import {
  useGetPlaybackReport, getGetPlaybackReportQueryKey,
  useGetClientSessionsReport, getGetClientSessionsReportQueryKey,
  useListClients, getListClientsQueryKey,
  useListMedia, getListMediaQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ReportMode = "media" | "sessions";

export default function ReportsPage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [mode, setMode] = useState<ReportMode>("sessions");
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: clients } = useListClients({ query: { queryKey: getListClientsQueryKey() } });

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Relatorios</h1>
        <p className="text-sm text-muted-foreground mt-1">Sessoes por filial e execucao de locucoes</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-6 bg-muted/40 p-1 rounded-lg w-fit">
        <button
          data-testid="tab-sessions"
          onClick={() => setMode("sessions")}
          className={cn(
            "px-4 py-1.5 text-sm rounded-md font-medium transition-all",
            mode === "sessions" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Por Cliente / Sessoes
        </button>
        <button
          data-testid="tab-media"
          onClick={() => setMode("media")}
          className={cn(
            "px-4 py-1.5 text-sm rounded-md font-medium transition-all",
            mode === "media" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Por Midia
        </button>
      </div>

      {mode === "sessions"
        ? <SessionsReport clients={Array.isArray(clients) ? clients : []} startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} />
        : <MediaReport clients={Array.isArray(clients) ? clients : []} startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} />}
    </div>
  );
}

type SectionProps = {
  clients: { id: number; name: string; email: string }[];
  startDate: string;
  endDate: string;
  setStartDate: (s: string) => void;
  setEndDate: (s: string) => void;
};

function SessionsReport({ clients, startDate, endDate, setStartDate, setEndDate }: SectionProps) {
  const [clientId, setClientId] = useState<string>("");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  const params = clientId ? {
    clientId: parseInt(clientId),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  } : null;

  const { data: report, isLoading } = useGetClientSessionsReport(
    params ?? { clientId: 0 },
    { query: { queryKey: getGetClientSessionsReportQueryKey(params ?? { clientId: 0 }), enabled: !!params } }
  );

  return (
    <>
      <div className="bg-card border border-card-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Cliente *</Label>
            <Select value={clientId || ""} onValueChange={setClientId}>
              <SelectTrigger data-testid="select-sessions-client">
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(clients) && clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data Inicial</Label>
            <Input data-testid="input-sessions-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>Data Final</Label>
            <Input data-testid="input-sessions-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      {!clientId && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center text-muted-foreground">
          Selecione um cliente acima para ver as sessoes e execucoes de locucao por filial.
        </div>
      )}

      {clientId && isLoading && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center text-muted-foreground">
          Carregando...
        </div>
      )}

      {clientId && !isLoading && report && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center gap-3">
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-emails-count">{Array.isArray(report.emailSummary) ? report.emailSummary.length : 0}</p>
                <p className="text-xs text-muted-foreground">Filiais (emails) ativos</p>
              </div>
            </div>
            <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center gap-3">
              <BarChart2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-sessions-count">{Array.isArray(report.sessions) ? report.sessions.length : 0}</p>
                <p className="text-xs text-muted-foreground">Sessoes registradas</p>
              </div>
            </div>
            <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center gap-3">
              <BarChart2 className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-jingles-count">
                  {Array.isArray(report.emailSummary)
                    ? report.emailSummary.reduce((s, e) => s + (Array.isArray(e.jingles) ? e.jingles.reduce((x, j) => x + (j.plays || 0), 0) : 0), 0)
                    : 0}
                </p>
                <p className="text-xs text-muted-foreground">Locucoes executadas</p>
              </div>
            </div>
          </div>

          {/* Per-email summary with expandable jingle breakdown */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-card-border bg-muted/30">
              <h3 className="text-sm font-semibold text-foreground">Resumo por Email (Filial)</h3>
              <p className="text-xs text-muted-foreground">Clique em uma filial para ver as locucoes executadas</p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-card-border bg-muted/20">
                  <th className="w-8" />
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Email da filial</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Sessoes</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tempo total (min)</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Locucoes (total)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {(!Array.isArray(report.emailSummary) || report.emailSummary.length === 0) && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Nenhuma execucao registrada nesse periodo</td></tr>
                )}
                {Array.isArray(report.emailSummary) && report.emailSummary.map((e) => {
                  const expanded = expandedEmail === e.email;
                  const totalJingles = Array.isArray(e.jingles) ? e.jingles.reduce((s, j) => s + (j.plays || 0), 0) : 0;
                  return (
                    <div key={`frag-${e.email}`} style={{ display: "contents" }}>
                      <tr
                        key={`row-${e.email}`}
                        data-testid={`row-email-${e.email}`}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedEmail(expanded ? null : e.email)}
                      >
                        <td className="pl-3">
                          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </td>
                        <td className="px-5 py-3 font-medium text-foreground font-mono text-xs">{e.email}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{e.sessionsCount}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{e.totalDurationMinutes.toFixed(1)}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold text-purple-600">{totalJingles}</td>
                      </tr>
                      {expanded && (
                        <tr key={`exp-${e.email}`} className="bg-muted/10">
                          <td />
                          <td colSpan={4} className="px-5 py-3">
                            {(!Array.isArray(e.jingles) || e.jingles.length === 0) ? (
                              <p className="text-xs text-muted-foreground italic">Sem execucao de locucoes neste periodo.</p>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Locucoes executadas por esta filial</p>
                                {e.jingles.map((j) => (
                                  <div key={j.mediaId} data-testid={`jingle-${e.email}-${j.mediaId}`} className="flex justify-between items-center py-1.5 border-b border-card-border/50 last:border-0">
                                    <span className="text-sm text-foreground">{j.title}</span>
                                    <span className="text-sm font-semibold text-purple-600 tabular-nums">{j.plays}x</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </div>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Sessions detail (multiple per day OK) */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-card-border bg-muted/30">
              <h3 className="text-sm font-semibold text-foreground">Sessoes (inicio / fim)</h3>
              <p className="text-xs text-muted-foreground">Cada linha = uma sessao do player. Multiplas sessoes do mesmo email no mesmo dia aparecem separadas.</p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[580px]">
              <thead>
                <tr className="border-b border-card-border bg-muted/20">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Inicio</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Fim</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Duracao (min)</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Locucoes</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Musicas</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Dispositivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {(!Array.isArray(report.sessions) || report.sessions.length === 0) && (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Nenhuma sessao no periodo</td></tr>
                )}
                {Array.isArray(report.sessions) && report.sessions.map((s, idx) => (
                  <tr key={idx} data-testid={`row-session-${idx}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-xs text-foreground">{s.email}</td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">{format(new Date(s.startedAt), "dd/MM HH:mm:ss", { locale: ptBR })}</td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">{format(new Date(s.endedAt), "dd/MM HH:mm:ss", { locale: ptBR })}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{s.durationMinutes.toFixed(1)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-purple-600">{s.jinglePlays}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{s.musicPlays}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground/70">{s.deviceUuid.substring(0, 8)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function MediaReport({ clients, startDate, endDate, setStartDate, setEndDate }: SectionProps) {
  const [clientEmail, setClientEmail] = useState("");
  const [mediaId, setMediaId] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"music" | "jingle" | "voiceover">("jingle");

  const { data: allMedia } = useListMedia(
    { type: typeFilter },
    { query: { queryKey: getListMediaQueryKey({ type: typeFilter }) } },
  );

  const params = {
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    ...(clientEmail && { clientEmail }),
    ...(mediaId && { mediaId: parseInt(mediaId) }),
  };
  const { data: report, isLoading } = useGetPlaybackReport(params, {
    query: { queryKey: getGetPlaybackReportQueryKey(params), enabled: !!clientEmail && !!mediaId }
  });

  return (
    <>
      <div className="bg-card border border-card-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Filtros</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <Label>Data Inicial</Label>
            <Input data-testid="input-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>Data Final</Label>
            <Input data-testid="input-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label>Cliente *</Label>
            <Select value={clientEmail} onValueChange={setClientEmail}>
              <SelectTrigger data-testid="select-client"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {Array.isArray(clients) && clients.map((c) => <SelectItem key={c.id} value={c.email}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as "music" | "jingle" | "voiceover"); setMediaId(""); }}>
              <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="music">🎵 Música</SelectItem>
                <SelectItem value="jingle">🔔 Jingle</SelectItem>
                <SelectItem value="voiceover">🎙️ Locução</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Midia *</Label>
            <Select value={mediaId} onValueChange={setMediaId}>
              <SelectTrigger data-testid="select-media"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {Array.isArray(allMedia) && allMedia.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {(!clientEmail || !mediaId) && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center text-muted-foreground">
          Selecione um cliente e uma midia especifica para ver as execucoes.
        </div>
      )}

      {clientEmail && mediaId && (
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-primary/10 border border-primary/20 rounded-xl px-6 py-4 flex items-center gap-3">
            <BarChart2 className="w-5 h-5 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-total-plays">{isLoading ? "–" : (report?.totalPlays ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total de execucoes</p>
            </div>
          </div>
        </div>
      )}

      {clientEmail && mediaId && (
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-card-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Midia</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Dispositivo</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Data/Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && [...Array(8)].map((_, i) => <tr key={i}><td colSpan={5} className="px-5 py-4"><div className="h-4 bg-muted animate-pulse rounded" /></td></tr>)}
            {Array.isArray(report?.entries) && report.entries.map((e) => (
              <tr key={e.id} data-testid={`row-log-${e.id}`} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 font-medium text-foreground">{e.mediaTitle}</td>
                <td className="px-5 py-3">
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    e.mediaType === "jingle" ? "bg-amber-500/10 text-amber-600" : e.mediaType === "voiceover" ? "bg-purple-500/10 text-purple-600" : "bg-blue-500/10 text-blue-600"
                  )}>
                    {e.mediaType === "jingle" ? "Jingle" : e.mediaType === "voiceover" ? "Locução" : "Música"}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{e.clientEmail}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{e.deviceUuid.substring(0, 12)}...</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{format(new Date(e.playedAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</td>
              </tr>
            ))}
            {!isLoading && !report?.entries?.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Nenhum registro encontrado para os filtros selecionados</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
      )}
    </>
  );
}
