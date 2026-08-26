import { Users, Monitor, Music, Activity, Wifi, WifiOff, Clock } from "lucide-react";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetDeviceStatusOverview, getGetDeviceStatusOverviewQueryKey,
  useGetTopMedia, getGetTopMediaQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: number | undefined; sub?: string; color: string }) {
  return (
    <div data-testid={`card-${label.toLowerCase().replace(/\s/g, "-")}`} className="bg-card border border-card-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground tabular-nums">{(value ?? 0).toLocaleString()}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  const { data: deviceStatuses } = useGetDeviceStatusOverview({
    query: { queryKey: getGetDeviceStatusOverviewQueryKey() }
  });
  const { data: topMedia } = useGetTopMedia({
    query: { queryKey: getGetTopMediaQueryKey() }
  });
  const { data: recentActivity } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() }
  });

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Visao geral do sistema de radio indoor</p>
      </div>

      {/* Stats Grid */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(7)].map((_, i) => <div key={i} className="bg-card border border-card-border rounded-xl p-5 h-28 animate-pulse" />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Users} label="Clientes" value={summary.totalClients} color="bg-blue-500/10 text-blue-600" />
          <StatCard icon={Monitor} label="Dispositivos Ativos" value={summary.activeDevices} sub={`${summary.pendingDevices ?? 0} pendentes`} color="bg-primary/10 text-primary" />
          <StatCard icon={Music} label="Midias" value={summary.totalMedia} color="bg-purple-500/10 text-purple-600" />
          <StatCard icon={Activity} label="Execucoes Hoje" value={summary.totalPlaysToday} color="bg-green-500/10 text-green-600" />
          <StatCard icon={Wifi} label="Online Agora" value={summary.onlineDevices} color="bg-emerald-500/10 text-emerald-600" />
          <StatCard icon={WifiOff} label="Offline" value={summary.offlineDevices} color="bg-orange-500/10 text-orange-600" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Device Status */}
        <div className="bg-card border border-card-border rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
            <h2 className="text-sm font-semibold text-foreground">Status dos Dispositivos</h2>
            <span className="text-xs text-muted-foreground">{Array.isArray(deviceStatuses) ? deviceStatuses.length : 0} total</span>
          </div>
          <div className="divide-y divide-card-border max-h-80 overflow-y-auto">
            {(!Array.isArray(deviceStatuses) || deviceStatuses.length === 0) ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum dispositivo registrado</div>
            ) : (
              deviceStatuses.map((d) => (
                <div key={d.id} data-testid={`device-status-${d.id}`} className="flex items-center gap-3 px-5 py-3">
                  <div className={`w-2 h-2 rounded-full flex-none ${d.isOnline ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{d.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.clientName ?? "Sem cliente"}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${d.status === "active" ? "bg-emerald-500/10 text-emerald-600" : d.status === "pending" ? "bg-amber-500/10 text-amber-600" : "bg-destructive/10 text-destructive"}`}>
                      {d.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Media */}
        <div className="bg-card border border-card-border rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
            <h2 className="text-sm font-semibold text-foreground">Mais Executadas</h2>
          </div>
          <div className="divide-y divide-card-border max-h-80 overflow-y-auto">
            {(!Array.isArray(topMedia) || topMedia.length === 0) ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma execucao registrada</div>
            ) : (
              topMedia.map((m, i) => (
                <div key={m.mediaId} data-testid={`top-media-${m.mediaId}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xs font-mono text-muted-foreground/60 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{m.title}</p>
                    {m.artist && <p className="text-xs text-muted-foreground">{m.artist}</p>}
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${m.type === "music" ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600"}`}>{m.type}</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">{m.playCount}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-card-border rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <h2 className="text-sm font-semibold text-foreground">Atividade Recente</h2>
        </div>
        <div className="divide-y divide-card-border">
          {(!Array.isArray(recentActivity) || recentActivity.length === 0) ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma atividade recente</div>
          ) : (
            recentActivity.map((a) => (
              <div key={a.id} data-testid={`activity-${a.id}`} className="flex items-center gap-4 px-5 py-3">
                <Clock className="w-3.5 h-3.5 text-muted-foreground/50 flex-none" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    <span className="font-medium">{a.mediaTitle}</span>
                    <span className="text-muted-foreground"> · {a.clientEmail}</span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate font-mono">{a.deviceUuid.substring(0, 12)}...</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${a.mediaType === "music" ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600"}`}>{a.mediaType}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(a.playedAt), { addSuffix: true, locale: ptBR })}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
