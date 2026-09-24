import { useState, useMemo } from "react";
import {
  BarChart2, Users, ChevronDown, ChevronRight, Download, FileText,
  Mail, RefreshCw, Clock, Radio, Check, Copy, Search, Calendar, FileSpreadsheet,
  Building2, MapPin
} from "lucide-react";
import {
  useGetPlaybackReport, getGetPlaybackReportQueryKey,
  useGetClientSessionsReport, getGetClientSessionsReportQueryKey,
  useListClients, getListClientsQueryKey,
  useListMedia, getListMediaQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function formatClientOptionLabel(c: any): string {
  if (Array.isArray(c.units) && c.units.length > 1) {
    const names = c.units.map((u: any) => u.name || u.email).filter(Boolean);
    const namesStr = names.length > 0 ? `: ${names.slice(0, 3).join(", ")}${names.length > 3 ? "..." : ""}` : "";
    return `${c.name} (${c.units.length} filiais${namesStr})`;
  }
  if (Array.isArray(c.units) && c.units.length === 1) {
    const u = c.units[0];
    return `${c.name} (${u.name || "Filial 1"} · ${u.email})`;
  }
  if (Array.isArray(c.authorizedEmails) && c.authorizedEmails.length > 1) {
    return `${c.name} (${c.authorizedEmails.length} filiais cadastradas)`;
  }
  return `${c.name}${c.email ? ` (${c.email})` : ""}`;
}

type ReportMode = "media" | "sessions";
type DatePreset = "30days" | "7days" | "today" | "thisMonth" | "allTime" | "custom";

export default function ReportsPage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [mode, setMode] = useState<ReportMode>("sessions");
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [activePreset, setActivePreset] = useState<DatePreset>("30days");

  const { data: clients } = useListClients({ query: { queryKey: getListClientsQueryKey() } });

  const applyPreset = (preset: DatePreset) => {
    setActivePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    if (preset === "30days") {
      setStartDate(new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]);
      setEndDate(todayStr);
    } else if (preset === "7days") {
      setStartDate(new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]);
      setEndDate(todayStr);
    } else if (preset === "today") {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "thisMonth") {
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else if (preset === "allTime") {
      setStartDate("2025-01-01");
      setEndDate(todayStr);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sessões por filial, histórico de transmissão e comprovação de veiculação de locuções
          </p>
        </div>
      </div>

      {/* Preset pills */}
      <div className="flex flex-wrap items-center gap-2 mb-6 p-2 rounded-xl bg-card border border-card-border shadow-xs">
        <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1.5 pl-1">
          <Calendar className="w-3.5 h-3.5 text-primary" /> Período:
        </span>
        <button
          onClick={() => applyPreset("30days")}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg font-medium transition-all",
            activePreset === "30days"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          Últimos 30 dias
        </button>
        <button
          onClick={() => applyPreset("7days")}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg font-medium transition-all",
            activePreset === "7days"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          Últimos 7 dias
        </button>
        <button
          onClick={() => applyPreset("today")}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg font-medium transition-all",
            activePreset === "today"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          Hoje
        </button>
        <button
          onClick={() => applyPreset("thisMonth")}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg font-medium transition-all",
            activePreset === "thisMonth"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          Mês Atual
        </button>
        <button
          onClick={() => applyPreset("allTime")}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg font-medium transition-all",
            activePreset === "allTime"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          Até o Último Evento (Histórico Completo)
        </button>
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
          Por Cliente / Sessões
        </button>
        <button
          data-testid="tab-media"
          onClick={() => setMode("media")}
          className={cn(
            "px-4 py-1.5 text-sm rounded-md font-medium transition-all",
            mode === "media" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Por Mídia
        </button>
      </div>

      {mode === "sessions" ? (
        <SessionsReport
          clients={Array.isArray(clients) ? clients : []}
          startDate={startDate}
          endDate={endDate}
          setStartDate={(d) => { setStartDate(d); setActivePreset("custom"); }}
          setEndDate={(d) => { setEndDate(d); setActivePreset("custom"); }}
        />
      ) : (
        <MediaReport
          clients={Array.isArray(clients) ? clients : []}
          startDate={startDate}
          endDate={endDate}
          setStartDate={(d) => { setStartDate(d); setActivePreset("custom"); }}
          setEndDate={(d) => { setEndDate(d); setActivePreset("custom"); }}
        />
      )}
    </div>
  );
}

type SectionProps = {
  clients: { id: number; name: string; email: string; masterEmail?: string }[];
  startDate: string;
  endDate: string;
  setStartDate: (s: string) => void;
  setEndDate: (s: string) => void;
};

// ── Export Helpers ──
function downloadCsv(content: string, filename: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDateDisplay(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

// ── Sessions Report Component ──
function SessionsReport({ clients, startDate, endDate, setStartDate, setEndDate }: SectionProps) {
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string>("");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  const selectedClient = useMemo(() => {
    return clients.find((c) => String(c.id) === clientId);
  }, [clients, clientId]);

  const params = clientId ? {
    clientId: parseInt(clientId),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  } : null;

  const { data: report, isLoading, refetch, isFetching } = useGetClientSessionsReport(
    params ?? { clientId: 0 },
    { query: { queryKey: getGetClientSessionsReportQueryKey(params ?? { clientId: 0 }), enabled: !!params } }
  );

  // Filtered summaries & sessions
  const filteredEmailSummary = useMemo(() => {
    if (!report?.emailSummary) return [];
    if (!searchTerm.trim()) return report.emailSummary;
    const term = searchTerm.toLowerCase();
    return report.emailSummary.filter(
      (e) => e.email.toLowerCase().includes(term) || ((e as any).unitName && (e as any).unitName.toLowerCase().includes(term))
    );
  }, [report?.emailSummary, searchTerm]);

  const filteredSessions = useMemo(() => {
    if (!report?.sessions) return [];
    if (!searchTerm.trim()) return report.sessions;
    const term = searchTerm.toLowerCase();
    return report.sessions.filter(
      (s) => s.email.toLowerCase().includes(term) ||
             ((s as any).unitName && (s as any).unitName.toLowerCase().includes(term)) ||
             (s.deviceUuid && s.deviceUuid.toLowerCase().includes(term))
    );
  }, [report?.sessions, searchTerm]);

  const totalJingles = useMemo(() => {
    if (!report?.emailSummary || !Array.isArray(report.emailSummary)) return 0;
    return report.emailSummary.reduce(
      (sum, e) => sum + (Array.isArray(e.jingles) ? e.jingles.reduce((x, j) => x + (j.plays || 0), 0) : 0),
      0
    );
  }, [report?.emailSummary]);

  const totalConnectedHours = useMemo(() => {
    if (!report?.emailSummary || !Array.isArray(report.emailSummary)) return 0;
    const totalMinutes = report.emailSummary.reduce((sum, e) => sum + (e.totalDurationMinutes || 0), 0);
    return Math.round((totalMinutes / 60) * 10) / 10;
  }, [report?.emailSummary]);

  // Export PDF
  const handleExportPdf = () => {
    if (!report || !selectedClient) return;

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const clientName = selectedClient.name;

      // Dark Banner Header
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 28, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text("RÁDIO INDOOR - RELATÓRIO EXECUTIVO", 14, 12);

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(203, 213, 225);
      doc.text("Comprovante Oficial de Sessões por Filial e Execução de Locuções", 14, 19);

      // Metadata
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.text(`Cliente: ${clientName}`, 14, 36);
      doc.setFont("helvetica", "normal");
      doc.text(`Período de Apuração: ${formatDateDisplay(startDate)} até ${formatDateDisplay(endDate)}`, 14, 42);
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, 14, 48);

      // Metric Boxes
      const totalEmails = Array.isArray(report.emailSummary) ? report.emailSummary.length : 0;
      const totalSessions = Array.isArray(report.sessions) ? report.sessions.length : 0;

      const drawBox = (x: number, label: string, value: string, color: [number, number, number]) => {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, 53, 43, 18, 2, 2, "FD");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text(label, x + 4, 59);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...color);
        doc.text(value, x + 4, 67);
      };

      drawBox(14, "FILIAIS ATIVAS", String(totalEmails), [15, 23, 42]);
      drawBox(61, "SESSÕES REGISTRADAS", String(totalSessions), [16, 185, 129]);
      drawBox(108, "LOCUÇÕES VEICULADAS", String(totalJingles), [147, 51, 234]);
      drawBox(155, "HORAS NO AR", `${totalConnectedHours}h`, [14, 165, 233]);

      // Table 1: Email summary
      const summaryRows = (report.emailSummary || []).map((e) => [
        (e as any).unitName ? `${(e as any).unitName} (${e.email})` : e.email,
        String(e.sessionsCount),
        `${(e.totalDurationMinutes || 0).toFixed(1)} min`,
        String(Array.isArray(e.jingles) ? e.jingles.reduce((x, j) => x + (j.plays || 0), 0) : 0),
      ]);

      autoTable(doc, {
        startY: 76,
        head: [["Filial / Unidade (Email)", "Sessões", "Tempo no Ar", "Locuções"]],
        body: summaryRows,
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        margin: { left: 14, right: 14 },
      });

      // Table 2: Top Jingles
      const finalY1 = (doc as any).lastAutoTable?.finalY || 100;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("Detalhamento de Locuções e Jingles Transmitidos", 14, finalY1 + 10);

      const jingleRows: string[][] = [];
      for (const e of report.emailSummary || []) {
        if (Array.isArray(e.jingles)) {
          const branchLabel = (e as any).unitName ? `${(e as any).unitName} (${e.email})` : e.email;
          for (const j of e.jingles) {
            jingleRows.push([branchLabel, j.title, `${j.plays}x`]);
          }
        }
      }

      autoTable(doc, {
        startY: finalY1 + 13,
        head: [["Filial / Unidade", "Título da Locução / Spot", "Execuções"]],
        body: jingleRows.length > 0 ? jingleRows : [["Todas", "Nenhuma locução no período", "0x"]],
        theme: "striped",
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      });

      // Table 3: Sessions detail
      const finalY2 = (doc as any).lastAutoTable?.finalY || 140;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("Histórico Cronológico de Sessões do Player", 14, finalY2 + 10);

      const sessionRows = (report.sessions || []).slice(0, 100).map((s) => [
        (s as any).unitName ? `${(s as any).unitName} (${s.email})` : s.email,
        format(new Date(s.startedAt), "dd/MM/yy HH:mm", { locale: ptBR }),
        format(new Date(s.endedAt), "dd/MM/yy HH:mm", { locale: ptBR }),
        `${s.durationMinutes.toFixed(1)}m`,
        String(s.jinglePlays),
        String(s.musicPlays),
        (s.deviceUuid || "").substring(0, 10),
      ]);

      autoTable(doc, {
        startY: finalY2 + 13,
        head: [["Filial / Terminal", "Início", "Fim", "Duração", "Locuções", "Músicas", "Terminal"]],
        body: sessionRows,
        theme: "striped",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
        styles: { fontSize: 7, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      });

      // Save PDF
      const cleanName = clientName.replace(/[^a-zA-Z0-9]/g, "_");
      doc.save(`Relatorio_Radio_Indoor_${cleanName}_${startDate}_${endDate}.pdf`);

      toast({
        title: "Relatório PDF Gerado!",
        description: "O download do documento executivo em PDF foi iniciado com sucesso.",
      });
    } catch (err) {
      console.error("Erro gerando PDF:", err);
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível compilar o documento PDF.",
        variant: "destructive",
      });
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!report || !selectedClient) return;

    let csv = "Filial / Unidade;Email;Data Inicio;Data Fim;Duracao Minutos;Locucoes;Musicas;Dispositivo\n";
    for (const s of report.sessions || []) {
      const uName = (s as any).unitName || s.email;
      csv += `"${uName}";"${s.email}";"${s.startedAt}";"${s.endedAt}";"${s.durationMinutes.toFixed(1)}";"${s.jinglePlays}";"${s.musicPlays}";"${s.deviceUuid}"\n`;
    }

    const cleanName = selectedClient.name.replace(/[^a-zA-Z0-9]/g, "_");
    downloadCsv(csv, `Sessoes_${cleanName}_${startDate}_${endDate}.csv`);

    toast({
      title: "Planilha CSV Exportada!",
      description: "Arquivo CSV compatível com Excel e Google Planilhas baixado com sucesso.",
    });
  };

  // Format Email Summary Body
  const emailSummaryText = useMemo(() => {
    if (!report || !selectedClient) return "";

    const lines: string[] = [
      `Prezados,`,
      ``,
      `Apresentamos o relatório de veiculação e sessões da Rádio Indoor para o cliente ${selectedClient.name}:`,
      ``,
      `• Período Analisado: ${formatDateDisplay(startDate)} a ${formatDateDisplay(endDate)}`,
      `• Filiais (Emails) Ativas: ${Array.isArray(report.emailSummary) ? report.emailSummary.length : 0}`,
      `• Total de Sessões Registradas: ${Array.isArray(report.sessions) ? report.sessions.length : 0}`,
      `• Total de Locuções / Spots Transmitidos: ${totalJingles}`,
      `• Horas Totais Conectado no Ar: ${totalConnectedHours} horas`,
      ``,
      `Resumo das Principais Locuções Executadas:`,
    ];

    const allJinglesMap = new Map<string, number>();
    for (const e of report.emailSummary || []) {
      if (Array.isArray(e.jingles)) {
        for (const j of e.jingles) {
          allJinglesMap.set(j.title, (allJinglesMap.get(j.title) || 0) + j.plays);
        }
      }
    }

    if (allJinglesMap.size === 0) {
      lines.push(`- Nenhuma locução comercial registrada neste período.`);
    } else {
      const sorted = Array.from(allJinglesMap.entries()).sort((a, b) => b[1] - a[1]);
      for (const [title, plays] of sorted.slice(0, 10)) {
        lines.push(`- ${title}: ${plays} veiculações`);
      }
    }

    lines.push(``);
    lines.push(`Relatório gerado automaticamente pelo Sistema Rádio Indoor.`);
    lines.push(`Data de emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`);

    return lines.join("\n");
  }, [report, selectedClient, startDate, endDate, totalJingles, totalConnectedHours]);

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(emailSummaryText);
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2500);
      toast({
        title: "Resumo Copiado!",
        description: "Texto formatado copiado para a área de transferência.",
      });
    } catch {
      toast({ title: "Falha ao copiar", description: "Copie o texto manualmente.", variant: "destructive" });
    }
  };

  const handleOpenMailto = () => {
    if (!selectedClient) return;
    const recipient = selectedClient.email || selectedClient.masterEmail || "";
    const subject = `[Rádio Indoor] Relatório de Veiculação - ${selectedClient.name} (${formatDateDisplay(startDate)} a ${formatDateDisplay(endDate)})`;
    const mailto = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailSummaryText)}`;
    window.open(mailto, "_blank");
  };

  return (
    <>
      <div className="bg-card border border-card-border rounded-xl p-5 mb-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            Filtros de Sessões
            {isFetching && <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />}
          </h2>
          {clientId && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading || isFetching}
                className="gap-1.5 text-xs h-8"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
                Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={!report?.sessions?.length}
                className="gap-1.5 text-xs h-8"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Planilha CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                disabled={!report?.sessions?.length}
                className="gap-1.5 text-xs h-8 text-foreground"
              >
                <FileText className="w-3.5 h-3.5 text-red-500" />
                Gerar PDF
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setEmailModalOpen(true)}
                disabled={!report}
                className="gap-1.5 text-xs h-8"
              >
                <Mail className="w-3.5 h-3.5" />
                Enviar Resumo por E-mail
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Cliente *</Label>
            <Select value={clientId || ""} onValueChange={setClientId}>
              <SelectTrigger data-testid="select-sessions-client">
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(clients) && clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {formatClientOptionLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Data Inicial</Label>
            <Input
              data-testid="input-sessions-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Data Final</Label>
            <Input
              data-testid="input-sessions-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {!clientId && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center text-muted-foreground shadow-xs">
          <Radio className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50 animate-pulse" />
          Selecione um cliente acima para ver as sessões, horas no ar e execuções de locução por filial.
        </div>
      )}

      {clientId && isLoading && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center text-muted-foreground shadow-xs">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 text-primary animate-spin" />
          Carregando dados de transmissão e sessões...
        </div>
      )}

      {clientId && !isLoading && report && (
        <>
          {/* Summary KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center gap-3 shadow-xs">
              <Users className="w-6 h-6 text-primary flex-none" />
              <div>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-emails-count">
                    {Array.isArray(report.emailSummary) ? report.emailSummary.filter((e) => (e.sessionsCount || 0) > 0).length : 0}
                  </p>
                  {Array.isArray(report.emailSummary) && report.emailSummary.length > (report.emailSummary.filter((e) => (e.sessionsCount || 0) > 0).length) && (
                    <span className="text-xs text-muted-foreground font-medium">
                      / {report.emailSummary.length} cadastradas
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Filiais ativas no período</p>
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center gap-3 shadow-xs">
              <BarChart2 className="w-6 h-6 text-emerald-600 flex-none" />
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-sessions-count">
                  {Array.isArray(report.sessions) ? report.sessions.length : 0}
                </p>
                <p className="text-xs text-muted-foreground">Sessões registradas</p>
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center gap-3 shadow-xs">
              <Radio className="w-6 h-6 text-purple-600 flex-none" />
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums text-purple-600" data-testid="text-jingles-count">
                  {totalJingles}
                </p>
                <p className="text-xs text-muted-foreground">Locuções executadas</p>
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-center gap-3 shadow-xs">
              <Clock className="w-6 h-6 text-cyan-600 flex-none" />
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums text-cyan-600">
                  {totalConnectedHours}h
                </p>
                <p className="text-xs text-muted-foreground">Tempo total no ar</p>
              </div>
            </div>
          </div>

          {/* Quick search input */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filtrar por filial (email)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            {searchTerm && (
              <Button variant="ghost" size="sm" onClick={() => setSearchTerm("")} className="text-xs h-9">
                Limpar busca
              </Button>
            )}
          </div>

          {/* Per-email summary with expandable jingle breakdown */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden mb-6 shadow-xs">
            <div className="px-5 py-3 border-b border-card-border bg-muted/30 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Resumo por Filial (Email)</h3>
                <p className="text-xs text-muted-foreground">Clique em uma filial para ver as locuções executadas</p>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {filteredEmailSummary.length} filiais encontradas
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-card-border bg-muted/20">
                    <th className="w-8" />
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Filial / Unidade & E-mail
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Sessões
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Tempo total (min)
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Locuções (total)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {filteredEmailSummary.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                        Nenhuma execução registrada para este cliente no período selecionado.
                      </td>
                    </tr>
                  )}
                  {filteredEmailSummary.map((e) => {
                    const expanded = expandedEmail === e.email;
                    const emailTotalJingles = Array.isArray(e.jingles) ? e.jingles.reduce((s, j) => s + (j.plays || 0), 0) : 0;
                    return (
                      <tr key={`group-${e.email}`} style={{ display: "contents" }}>
                        <tr
                          data-testid={`row-email-${e.email}`}
                          className="hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => setExpandedEmail(expanded ? null : e.email)}
                        >
                          <td className="pl-3 py-3">
                            {expanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-none">
                                <Building2 className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold text-foreground text-xs block truncate">
                                  {(e as any).unitName || e.email}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-mono block">
                                  {e.email}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {e.sessionsCount > 0 ? (
                              <span className="font-medium text-foreground">{e.sessionsCount}</span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                0
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                            {(e.totalDurationMinutes || 0).toFixed(1)}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums font-semibold text-purple-600">
                            {emailTotalJingles}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-muted/15 border-b border-card-border">
                            <td />
                            <td colSpan={4} className="px-5 py-3">
                              {!Array.isArray(e.jingles) || e.jingles.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">
                                  Sem execução de locuções comerciais nesta filial no período.
                                </p>
                              ) : (
                                <div className="space-y-1.5">
                                  <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                                    Locuções e Spots veiculados por esta filial ({e.email}):
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {e.jingles.map((j) => (
                                      <div
                                        key={j.mediaId}
                                        data-testid={`jingle-${e.email}-${j.mediaId}`}
                                        className="flex justify-between items-center px-3 py-2 bg-card rounded-md border border-card-border/70 text-xs"
                                      >
                                        <span className="font-medium text-foreground truncate mr-2">{j.title}</span>
                                        <span className="font-semibold text-purple-600 tabular-nums px-2 py-0.5 rounded bg-purple-500/10">
                                          {j.plays}x
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sessions detail table */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-xs">
            <div className="px-5 py-3 border-b border-card-border bg-muted/30 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Sessões (Início / Fim)</h3>
                <p className="text-xs text-muted-foreground">
                  Cada linha representa um período contínuo de player em reprodução.
                </p>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {filteredSessions.length} sessões listadas
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[580px]">
                <thead>
                  <tr className="border-b border-card-border bg-muted/20">
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Filial / Terminal
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Início
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Fim
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Duração (min)
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Locuções
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Músicas
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Terminal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {filteredSessions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                        Nenhuma sessão registrada no período.
                      </td>
                    </tr>
                  )}
                  {filteredSessions.map((s, idx) => (
                    <tr key={idx} data-testid={`row-session-${idx}`} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-2.5">
                        <span className="font-semibold text-foreground text-xs block truncate">
                          {(s as any).unitName || s.email}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono block">
                          {s.email}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground text-xs">
                        {format(new Date(s.startedAt), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground text-xs">
                        {format(new Date(s.endedAt), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {(s.durationMinutes || 0).toFixed(1)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-purple-600">
                        {s.jinglePlays}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                        {s.musicPlays}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground/70">
                        {(s.deviceUuid || "").substring(0, 10)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Email Summary Dialog */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Enviar Resumo de Veiculação por E-mail
            </DialogTitle>
            <DialogDescription>
              Envie o resumo executivo das transmissões para o cliente cadastrado ou copie o relatório formatado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div>
              <Label className="text-xs font-medium block mb-1">Destinatário Cadastrado</Label>
              <Input
                readOnly
                value={selectedClient?.email || selectedClient?.masterEmail || "cliente@empresa.com.br"}
                className="bg-muted font-mono text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-medium block mb-1">Assunto</Label>
              <Input
                readOnly
                value={`[Rádio Indoor] Relatório de Veiculação - ${selectedClient?.name || ""} (${formatDateDisplay(startDate)} a ${formatDateDisplay(endDate)})`}
                className="bg-muted text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-medium block mb-1">Prévia do Conteúdo</Label>
              <textarea
                readOnly
                rows={9}
                value={emailSummaryText}
                className="w-full text-xs font-mono p-3 rounded-md bg-muted/60 border border-card-border focus:outline-none resize-none"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySummary}
              className="gap-1.5 text-xs w-full sm:w-auto"
            >
              {copiedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedSuccess ? "Copiado!" : "Copiar Resumo (WhatsApp/Email)"}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleOpenMailto}
              className="gap-1.5 text-xs w-full sm:w-auto"
            >
              <Mail className="w-3.5 h-3.5" />
              Abrir no Aplicativo de E-mail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Media Report Component ──
function MediaReport({ clients, startDate, endDate, setStartDate, setEndDate }: SectionProps) {
  const { toast } = useToast();
  const [clientEmail, setClientEmail] = useState("");
  const [mediaId, setMediaId] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "music" | "jingle" | "voiceover">("all");
  const [searchLogTerm, setSearchLogTerm] = useState("");
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  const selectedClient = useMemo(() => {
    return clients.find((c) => c.email === clientEmail);
  }, [clients, clientEmail]);

  const { data: allMedia } = useListMedia(
    typeFilter !== "all" ? { type: typeFilter } : undefined,
    { query: { queryKey: getListMediaQueryKey(typeFilter !== "all" ? { type: typeFilter } : undefined) } }
  );

  const params = {
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    ...(clientEmail && { clientEmail }),
    ...(mediaId && mediaId !== "all" && { mediaId: parseInt(mediaId) }),
    ...(typeFilter && typeFilter !== "all" && { type: typeFilter }),
  };

  const { data: report, isLoading, refetch, isFetching } = useGetPlaybackReport(params, {
    query: {
      queryKey: getGetPlaybackReportQueryKey(params),
      enabled: !!clientEmail,
    },
  });

  const filteredEntries = useMemo(() => {
    if (!report?.entries) return [];
    if (!searchLogTerm.trim()) return report.entries;
    const term = searchLogTerm.toLowerCase();
    return report.entries.filter(
      (e) =>
        e.mediaTitle.toLowerCase().includes(term) ||
        e.clientEmail.toLowerCase().includes(term) ||
        (e.deviceUuid && e.deviceUuid.toLowerCase().includes(term))
    );
  }, [report?.entries, searchLogTerm]);

  // Statistics
  const jingleCount = useMemo(() => {
    if (!report?.entries) return 0;
    return report.entries.filter((e) => e.mediaType === "jingle" || e.mediaType === "voiceover").length;
  }, [report?.entries]);

  const musicCount = useMemo(() => {
    if (!report?.entries) return 0;
    return report.entries.filter((e) => e.mediaType === "music").length;
  }, [report?.entries]);

  // Export PDF
  const handleExportPdf = () => {
    if (!report || !selectedClient) return;

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const clientName = selectedClient.name;

      // Header Banner
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 28, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text("RÁDIO INDOOR - COMPROVANTE DE VEICULAÇÃO", 14, 12);

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(203, 213, 225);
      doc.text("Registro e Comprovação de Execução de Mídias e Spots Comerciais", 14, 19);

      // Metadata
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.text(`Cliente: ${clientName} (${selectedClient.email})`, 14, 36);
      doc.setFont("helvetica", "normal");
      doc.text(`Período de Apuração: ${formatDateDisplay(startDate)} até ${formatDateDisplay(endDate)}`, 14, 42);
      doc.text(`Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, 14, 48);

      // Metric Boxes
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 53, 58, 18, 2, 2, "FD");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("TOTAL DE EXECUÇÕES", 18, 59);
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(String(report.totalPlays || 0), 18, 67);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(76, 53, 58, 18, 2, 2, "FD");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("LOCUÇÕES / JINGLES", 80, 59);
      doc.setFontSize(13);
      doc.setTextColor(147, 51, 234);
      doc.text(String(jingleCount), 80, 67);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(138, 53, 58, 18, 2, 2, "FD");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("MÚSICAS EXECUTADAS", 142, 59);
      doc.setFontSize(13);
      doc.setTextColor(14, 165, 233);
      doc.text(String(musicCount), 142, 67);

      const tableRows = (filteredEntries || []).map((e) => [
        e.mediaTitle,
        e.mediaType === "jingle" ? "Jingle" : e.mediaType === "voiceover" ? "Locução" : "Música",
        e.clientEmail,
        (e.deviceUuid || "").substring(0, 10),
        format(new Date(e.playedAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      ]);

      autoTable(doc, {
        startY: 76,
        head: [["Mídia / Spot", "Tipo", "Filial (Email)", "Terminal", "Data e Hora"]],
        body: tableRows,
        theme: "striped",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        margin: { left: 14, right: 14 },
      });

      const cleanName = clientName.replace(/[^a-zA-Z0-9]/g, "_");
      doc.save(`Comprovante_Veiculacao_${cleanName}_${startDate}_${endDate}.pdf`);

      toast({
        title: "Comprovante PDF Gerado!",
        description: "Documento oficial de veiculação baixado com sucesso.",
      });
    } catch (err) {
      console.error("Erro gerando PDF:", err);
      toast({ title: "Erro ao gerar PDF", description: "Falha na compilação do PDF.", variant: "destructive" });
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!report || !selectedClient) return;

    let csv = "Midia;Tipo;Email Filial;Terminal;Data e Hora\n";
    for (const e of filteredEntries) {
      csv += `"${e.mediaTitle}";"${e.mediaType}";"${e.clientEmail}";"${e.deviceUuid}";"${e.playedAt}"\n`;
    }

    const cleanName = selectedClient.name.replace(/[^a-zA-Z0-9]/g, "_");
    downloadCsv(csv, `Veiculacoes_${cleanName}_${startDate}_${endDate}.csv`);

    toast({
      title: "Planilha CSV Exportada!",
      description: "Arquivo CSV de veiculações baixado com sucesso.",
    });
  };

  return (
    <>
      <div className="bg-card border border-card-border rounded-xl p-5 mb-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            Filtros por Mídia
            {isFetching && <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />}
          </h2>
          {clientEmail && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading || isFetching}
                className="gap-1.5 text-xs h-8"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
                Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={!report?.entries?.length}
                className="gap-1.5 text-xs h-8"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Planilha CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                disabled={!report?.entries?.length}
                className="gap-1.5 text-xs h-8"
              >
                <FileText className="w-3.5 h-3.5 text-red-500" />
                Gerar PDF
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Data Inicial</Label>
            <Input
              data-testid="input-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Data Final</Label>
            <Input
              data-testid="input-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Cliente *</Label>
            <Select value={clientEmail} onValueChange={setClientEmail}>
              <SelectTrigger data-testid="select-client">
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(clients) && clients.map((c) => (
                  <SelectItem key={c.id} value={c.email}>
                    {formatClientOptionLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Tipo de Mídia</Label>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v as any);
                setMediaId("all");
              }}
            >
              <SelectTrigger data-testid="select-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">✨ Todos os tipos</SelectItem>
                <SelectItem value="voiceover">🎙️ Locução</SelectItem>
                <SelectItem value="jingle">🔔 Jingle</SelectItem>
                <SelectItem value="music">🎵 Música</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Mídia Específica</Label>
            <Select value={mediaId} onValueChange={setMediaId}>
              <SelectTrigger data-testid="select-media">
                <SelectValue placeholder="Todas as mídias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as mídias</SelectItem>
                {Array.isArray(allMedia) && allMedia.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!clientEmail && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center text-muted-foreground shadow-xs">
          <Radio className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50 animate-pulse" />
          Selecione um cliente acima para visualizar o comprovante e histórico de execuções.
        </div>
      )}

      {clientEmail && (
        <>
          {/* Summary metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-primary/10 border border-primary/20 rounded-xl px-6 py-4 flex items-center gap-3 shadow-xs">
              <BarChart2 className="w-6 h-6 text-primary flex-none" />
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-total-plays">
                  {isLoading ? "–" : (report?.totalPlays ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Total de execuções</p>
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-xl px-6 py-4 flex items-center gap-3 shadow-xs">
              <Radio className="w-6 h-6 text-purple-600 flex-none" />
              <div>
                <p className="text-2xl font-bold text-purple-600 tabular-nums">
                  {isLoading ? "–" : jingleCount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Locuções / Jingles</p>
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-xl px-6 py-4 flex items-center gap-3 shadow-xs">
              <Clock className="w-6 h-6 text-blue-600 flex-none" />
              <div>
                <p className="text-2xl font-bold text-blue-600 tabular-nums">
                  {isLoading ? "–" : musicCount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Músicas veiculadas</p>
              </div>
            </div>
          </div>

          {/* Quick search filter */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por título de mídia ou email..."
                value={searchLogTerm}
                onChange={(e) => setSearchLogTerm(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            {searchLogTerm && (
              <Button variant="ghost" size="sm" onClick={() => setSearchLogTerm("")} className="text-xs h-9">
                Limpar busca
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-xs">
            <div className="px-5 py-3 border-b border-card-border bg-muted/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Comprovante de Veiculação de Mídias</h3>
              <span className="text-xs text-muted-foreground font-mono">
                {filteredEntries.length} registros exibidos
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-card-border bg-muted/20">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Mídia
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Tipo
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Email
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Dispositivo
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Data/Hora
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {isLoading && [...Array(6)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-5 py-4">
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))}
                  {!isLoading && filteredEntries.map((e) => (
                    <tr key={e.id} data-testid={`row-log-${e.id}`} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground">{e.mediaTitle}</td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded font-medium",
                            e.mediaType === "jingle"
                              ? "bg-amber-500/10 text-amber-600"
                              : e.mediaType === "voiceover"
                              ? "bg-purple-500/10 text-purple-600"
                              : "bg-blue-500/10 text-blue-600"
                          )}
                        >
                          {e.mediaType === "jingle" ? "Jingle" : e.mediaType === "voiceover" ? "Locução" : "Música"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs font-mono">{e.clientEmail}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                        {(e.deviceUuid || "").substring(0, 12)}...
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {format(new Date(e.playedAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && !filteredEntries.length && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                        Nenhum registro encontrado para os filtros selecionados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
