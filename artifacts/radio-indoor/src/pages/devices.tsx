import { useState, useMemo } from "react";
import {
  Wifi,
  WifiOff,
  Search,
  RefreshCw,
  Copy,
  Check,
  Building2,
  Mail,
  Radio,
  Clock,
  Trash2,
} from "lucide-react";
import {
  useListDevices,
  getListDevicesQueryKey,
  useListClients,
  getListClientsQueryKey,
  useDeleteDevice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ClientEmailEntry {
  id: string;
  email: string;
  clientId: number;
  clientName: string;
  role: "master" | "authorized" | "device" | "login";
  roleLabel: string;
  isOnline: boolean;
  lastSeen: string | null;
  deviceId?: number;
  uuid?: string;
}

export default function DevicesPage() {
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string } | null>(null);

  const { toast } = useToast();
  const qc = useQueryClient();

  // Fetch clients list
  const { data: clientsData, isLoading: isLoadingClients } = useListClients({
    query: { queryKey: getListClientsQueryKey() },
  });

  // Fetch devices list with auto-refresh every 10 seconds for real-time monitoring
  const {
    data: devicesData,
    isLoading: isLoadingDevices,
    isFetching: isFetchingDevices,
    refetch: refetchDevices,
  } = useListDevices(
    {},
    {
      query: {
        queryKey: getListDevicesQueryKey({}),
        refetchInterval: 10000, // 10s auto-refresh
      },
    }
  );

  const del = useDeleteDevice({
    mutation: {
      onSuccess: () => {
        toast({ title: "Registro de dispositivo removido" });
        qc.invalidateQueries({ queryKey: getListDevicesQueryKey({}) });
        setDeleteTarget(null);
      },
      onError: () => toast({ title: "Erro ao remover dispositivo", variant: "destructive" }),
    },
  });

  const clients = useMemo(() => {
    return Array.isArray(clientsData) ? clientsData : [];
  }, [clientsData]);

  const devices = useMemo(() => {
    return Array.isArray(devicesData) ? devicesData : [];
  }, [devicesData]);

  // Aggregate all emails belonging to clients
  const emailEntries = useMemo<ClientEmailEntry[]>(() => {
    const entries: ClientEmailEntry[] = [];
    const seenEmails = new Set<string>();

    const targetClients =
      selectedClientId === "all"
        ? clients
        : clients.filter((c) => String(c.id) === selectedClientId);

    for (const client of targetClients) {
      const clientDevices = devices.filter((d) => d.clientId === client.id);

      // 1. Master Email
      if (client.masterEmail) {
        const cleanEmail = client.masterEmail.trim().toLowerCase();
        const key = `${client.id}:${cleanEmail}`;
        if (!seenEmails.has(key)) {
          seenEmails.add(key);
          const dev = clientDevices.find((d) => d.email?.trim().toLowerCase() === cleanEmail);
          const isOnline = dev
            ? (dev as any).isOnline ??
              (dev.lastSeen ? Date.now() - new Date(dev.lastSeen).getTime() < 5 * 60 * 1000 : false)
            : false;
          entries.push({
            id: `master-${client.id}-${cleanEmail}`,
            email: client.masterEmail,
            clientId: client.id,
            clientName: client.name,
            role: "master",
            roleLabel: "E-mail Principal (Master)",
            isOnline,
            lastSeen: dev?.lastSeen ?? null,
            deviceId: dev?.id,
            uuid: dev?.uuid,
          });
        }
      }

      // 2. Authorized Emails
      const authorized = Array.isArray(client.authorizedEmails) ? client.authorizedEmails : [];
      for (const authEmail of authorized) {
        if (!authEmail) continue;
        const cleanEmail = authEmail.trim().toLowerCase();
        const key = `${client.id}:${cleanEmail}`;
        if (!seenEmails.has(key)) {
          seenEmails.add(key);
          const dev = clientDevices.find((d) => d.email?.trim().toLowerCase() === cleanEmail);
          const isOnline = dev
            ? (dev as any).isOnline ??
              (dev.lastSeen ? Date.now() - new Date(dev.lastSeen).getTime() < 5 * 60 * 1000 : false)
            : false;
          entries.push({
            id: `auth-${client.id}-${cleanEmail}`,
            email: authEmail,
            clientId: client.id,
            clientName: client.name,
            role: "authorized",
            roleLabel: "E-mail Autorizado",
            isOnline,
            lastSeen: dev?.lastSeen ?? null,
            deviceId: dev?.id,
            uuid: dev?.uuid,
          });
        }
      }

      // 3. Client login email if different
      if (client.email) {
        const cleanEmail = client.email.trim().toLowerCase();
        const key = `${client.id}:${cleanEmail}`;
        if (!seenEmails.has(key)) {
          seenEmails.add(key);
          const dev = clientDevices.find((d) => d.email?.trim().toLowerCase() === cleanEmail);
          const isOnline = dev
            ? (dev as any).isOnline ??
              (dev.lastSeen ? Date.now() - new Date(dev.lastSeen).getTime() < 5 * 60 * 1000 : false)
            : false;
          entries.push({
            id: `login-${client.id}-${cleanEmail}`,
            email: client.email,
            clientId: client.id,
            clientName: client.name,
            role: "login",
            roleLabel: "Login do Cliente",
            isOnline,
            lastSeen: dev?.lastSeen ?? null,
            deviceId: dev?.id,
            uuid: dev?.uuid,
          });
        }
      }

      // 4. Any other registered devices for this client
      for (const dev of clientDevices) {
        if (!dev.email) continue;
        const cleanEmail = dev.email.trim().toLowerCase();
        const key = `${client.id}:${cleanEmail}`;
        if (!seenEmails.has(key)) {
          seenEmails.add(key);
          const isOnline =
            (dev as any).isOnline ??
            (dev.lastSeen ? Date.now() - new Date(dev.lastSeen).getTime() < 5 * 60 * 1000 : false);
          entries.push({
            id: `dev-${dev.id}-${cleanEmail}`,
            email: dev.email,
            clientId: client.id,
            clientName: client.name,
            role: "device",
            roleLabel: "Terminal Conectado",
            isOnline,
            lastSeen: dev.lastSeen ?? null,
            deviceId: dev.id,
            uuid: dev.uuid,
          });
        }
      }
    }

    return entries;
  }, [clients, devices, selectedClientId]);

  // Filtered by search and status
  const filteredEntries = useMemo(() => {
    return emailEntries.filter((item) => {
      const matchSearch =
        !searchTerm ||
        item.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.roleLabel.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "online" && item.isOnline) ||
        (statusFilter === "offline" && !item.isOnline);

      return matchSearch && matchStatus;
    });
  }, [emailEntries, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const total = emailEntries.length;
    const online = emailEntries.filter((e) => e.isOnline).length;
    const offline = total - online;
    return { total, online, offline };
  }, [emailEntries]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(text);
    toast({ title: "E-mail copiado para a área de transferência" });
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const selectedClient = clients.find((c) => String(c.id) === selectedClientId);

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      {/* Header with Client Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-foreground">Dispositivos</h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ao Vivo
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Status em tempo real dos e-mails e terminais conectados por cliente
          </p>
        </div>

        {/* Client Selector & Refresh */}
        <div className="flex items-center gap-3">
          <div className="w-64 sm:w-72">
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger
                data-testid="select-client"
                className="w-full bg-card border-border shadow-xs h-10 font-medium"
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-4 h-4 text-primary shrink-0" />
                  <SelectValue placeholder="Selecione um cliente..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="font-semibold text-foreground">Todos os Clientes</span>
                </SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="truncate">{c.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => refetchDevices()}
            title="Atualizar agora"
            disabled={isFetchingDevices}
            className="h-10 w-10 shrink-0"
          >
            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", isFetchingDevices && "animate-spin text-primary")} />
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-card-border p-4 rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total de E-mails
            </p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {isLoadingClients || isLoadingDevices ? "–" : stats.total}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]">
              {selectedClient ? selectedClient.name : "Todos os clientes"}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Mail className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card border border-emerald-500/20 bg-emerald-500/5 p-4 rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              On Line Agora
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {isLoadingClients || isLoadingDevices ? "–" : stats.online}
              </p>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
              Conectados nos últimos 5 min
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Wifi className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card border border-card-border p-4 rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Off Line Agora
            </p>
            <p className="text-2xl font-bold text-muted-foreground mt-1">
              {isLoadingClients || isLoadingDevices ? "–" : stats.offline}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Desconectados no momento
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <WifiOff className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por e-mail ou nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 bg-card"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg self-start sm:self-auto">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "px-3 py-1 text-xs rounded-md font-medium transition-all",
              statusFilter === "all"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Todos ({stats.total})
          </button>
          <button
            onClick={() => setStatusFilter("online")}
            className={cn(
              "px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1.5",
              statusFilter === "online"
                ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            On Line ({stats.online})
          </button>
          <button
            onClick={() => setStatusFilter("offline")}
            className={cn(
              "px-3 py-1 text-xs rounded-md font-medium transition-all",
              statusFilter === "offline"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Off Line ({stats.offline})
          </button>
        </div>
      </div>

      {/* Emails Table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-card-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide w-36">
                  Status
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  E-mail do Terminal
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Cliente
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tipo
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Horário Logado / Deslogado
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide w-24">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {(isLoadingClients || isLoadingDevices) &&
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-4">
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </td>
                  </tr>
                ))}

              {!isLoadingClients &&
                !isLoadingDevices &&
                filteredEntries.map((item) => (
                  <tr
                    key={item.id}
                    data-testid={`row-email-${item.email}`}
                    className={cn(
                      "hover:bg-muted/20 transition-colors",
                      item.isOnline && "bg-emerald-500/[0.02]"
                    )}
                  >
                    {/* Status Pill */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {item.isOnline ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          ON LINE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                          OFF LINE
                        </span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground tracking-tight font-mono text-xs sm:text-sm">
                          {item.email}
                        </span>
                        <button
                          onClick={() => copyToClipboard(item.email)}
                          title="Copiar e-mail"
                          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                        >
                          {copiedEmail === item.email ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      {item.uuid && (
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          UUID: {item.uuid.substring(0, 16)}...
                        </p>
                      )}
                    </td>

                    {/* Cliente */}
                    <td className="px-5 py-4 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/60 text-xs font-medium text-foreground">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        {item.clientName}
                      </span>
                    </td>

                    {/* Tipo / Role */}
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded font-medium",
                          item.role === "master" &&
                            "bg-primary/10 text-primary border border-primary/20",
                          item.role === "authorized" &&
                            "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
                          item.role === "login" &&
                            "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
                          item.role === "device" &&
                            "bg-muted text-muted-foreground border border-border"
                        )}
                      >
                        {item.roleLabel}
                      </span>
                    </td>

                    {/* Horário Logado / Deslogado */}
                    <td className="px-5 py-4 text-xs">
                      {item.isOnline ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Logado agora
                          </span>
                          <span className="text-muted-foreground mt-0.5">
                            {item.lastSeen
                              ? `${format(new Date(item.lastSeen), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })} (${formatDistanceToNow(new Date(item.lastSeen), { addSuffix: true, locale: ptBR })})`
                              : "Conectado recentemente"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="font-medium text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {item.lastSeen ? "Deslogado / Último acesso" : "Nunca logado"}
                          </span>
                          <span className="text-muted-foreground/75 mt-0.5">
                            {item.lastSeen
                              ? `${format(new Date(item.lastSeen), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })} (${formatDistanceToNow(new Date(item.lastSeen), { addSuffix: true, locale: ptBR })})`
                              : "Sem registro de conexão"}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-5 py-4 text-right">
                      {item.deviceId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDeleteTarget({
                              id: item.deviceId!,
                              email: item.email,
                            })
                          }
                          title="Remover terminal registrado"
                          className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">–</span>
                      )}
                    </td>
                  </tr>
                ))}

              {!isLoadingClients && !isLoadingDevices && filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    <Radio className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="font-medium">Nenhum e-mail ou dispositivo encontrado</p>
                    <p className="text-xs text-muted-foreground/75 mt-1">
                      {searchTerm
                        ? "Nenhum resultado para os filtros pesquisados."
                        : "Cadastre e-mails autorizados para este cliente na tela de Clientes."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Device Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover terminal?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O registro de conexão de <strong>{deleteTarget?.email}</strong> será removido do painel.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && del.mutate({ deviceId: deleteTarget.id })}
              disabled={del.isPending}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
