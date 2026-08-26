import { useState } from "react";
import { CheckCircle, XCircle, Trash2, Wifi, WifiOff } from "lucide-react";
import {
  useListDevices, getListDevicesQueryKey,
  useApproveDevice, useBlockDevice, useDeleteDevice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const STATUS_TABS = [
  { label: "Pendentes", value: "pending" },
  { label: "Ativos", value: "active" },
  { label: "Bloqueados", value: "blocked" },
];

export default function DevicesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = { status: statusFilter as "pending" | "active" | "blocked" };
  const { data: devices, isLoading } = useListDevices(params, {
    query: { queryKey: getListDevicesQueryKey(params) }
  });

  const inv = () => { STATUS_TABS.forEach((t) => qc.invalidateQueries({ queryKey: getListDevicesQueryKey({ status: t.value as "pending" | "active" | "blocked" }) })); };

  const approve = useApproveDevice({ mutation: { onSuccess: () => { toast({ title: "Dispositivo aprovado" }); inv(); }, onError: () => toast({ title: "Erro", variant: "destructive" }) } });
  const block = useBlockDevice({ mutation: { onSuccess: () => { toast({ title: "Dispositivo bloqueado" }); inv(); }, onError: () => toast({ title: "Erro", variant: "destructive" }) } });
  const del = useDeleteDevice({ mutation: { onSuccess: () => { toast({ title: "Dispositivo removido" }); inv(); setDeleteTarget(null); }, onError: () => toast({ title: "Erro", variant: "destructive" }) } });

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Dispositivos</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie os terminais dos clientes</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted/40 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            data-testid={`tab-${tab.label.toLowerCase()}`}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              "px-4 py-1.5 text-sm rounded-md font-medium transition-all",
              statusFilter === tab.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-card-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Online</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">UUID</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Cliente</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Ultimo Acesso</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {isLoading && [...Array(5)].map((_, i) => (
              <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-muted animate-pulse rounded" /></td></tr>
            ))}
            {Array.isArray(devices) && devices.map((d) => (
              <tr key={d.id} data-testid={`row-device-${d.id}`} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-4">
                  {d.isOnline
                    ? <Wifi className="w-4 h-4 text-emerald-500" />
                    : <WifiOff className="w-4 h-4 text-muted-foreground/40" />}
                </td>
                <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{d.uuid.substring(0, 12)}...</td>
                <td className="px-5 py-4 text-foreground">{d.email}</td>
                <td className="px-5 py-4 text-muted-foreground">{(d as any).clientName ?? "–"}</td>
                <td className="px-5 py-4 text-muted-foreground text-xs">
                  {d.lastSeen ? formatDistanceToNow(new Date(d.lastSeen), { addSuffix: true, locale: ptBR }) : "Nunca"}
                </td>
                <td className="px-5 py-4 text-center">
                  <span className={cn("text-xs px-2 py-0.5 rounded font-medium", {
                    "bg-amber-500/10 text-amber-600": d.status === "pending",
                    "bg-emerald-500/10 text-emerald-600": d.status === "active",
                    "bg-destructive/10 text-destructive": d.status === "blocked",
                  })}>
                    {d.status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1 justify-end">
                    {d.status === "pending" && (
                      <Button variant="ghost" size="sm" data-testid={`button-approve-${d.id}`} onClick={() => approve.mutate({ deviceId: d.id })} title="Aprovar" className="text-emerald-600 hover:text-emerald-700">
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {d.status === "active" && (
                      <Button variant="ghost" size="sm" data-testid={`button-block-${d.id}`} onClick={() => block.mutate({ deviceId: d.id })} title="Bloquear" className="text-destructive hover:text-destructive/80">
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {d.status === "blocked" && (
                      <Button variant="ghost" size="sm" data-testid={`button-unblock-${d.id}`} onClick={() => approve.mutate({ deviceId: d.id })} title="Reativar" className="text-emerald-600">
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" data-testid={`button-delete-${d.id}`} onClick={() => setDeleteTarget({ id: d.id, email: d.email })} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && !devices?.length && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Nenhum dispositivo encontrado</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remover dispositivo?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Dispositivo de <strong>{deleteTarget?.email}</strong> sera removido permanentemente.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button data-testid="button-confirm-delete" variant="destructive" onClick={() => deleteTarget && del.mutate({ deviceId: deleteTarget.id })} disabled={del.isPending}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
