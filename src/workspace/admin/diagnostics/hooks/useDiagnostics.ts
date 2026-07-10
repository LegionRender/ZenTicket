import { useState, useEffect, useCallback } from "react";
import { diagnosticsApi, DiagnosticsFilters, lastRequestDebug } from "../services/diagnosticsApi";

export const useDiagnostics = (initialFilters: DiagnosticsFilters = {}) => {
  const [filters, setFilters] = useState<DiagnosticsFilters>({
    limit: 20,
    view: "by_user",
    ...initialFilters
  });
  const [items, setItems] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({
    usersWithIssues: 0,
    inProcessTickets: 0,
    attentionTickets: 0,
    failedTickets: 0,
    readyTickets: 0,
    pendingRetries: 0,
    last24h: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchDiagnostics = useCallback(async (isLoadMore = false) => {
    setLoading(true);
    setError(null);
    if (!isLoadMore) {
      setItems([]);
      setUsers([]);
    }
    try {
      const activeFilters = { ...filters };
      if (isLoadMore && nextCursor) {
        activeFilters.cursor = nextCursor;
      } else {
        delete activeFilters.cursor;
      }

      const res = await diagnosticsApi.listDiagnostics(activeFilters);
      
      const viewVal = filters.view || "by_user";
      if (viewVal === "by_user" && !Array.isArray(res.users)) {
        throw new Error("ADMIN_DIAGNOSTICS_BY_USER_CONTRACT_MISSING_USERS");
      }
      
      const normalisedUsers = (res.users || []).map((u: any) => ({
        ...u,
        displayName: u.displayName || u.userDisplayName || u.email || "Usuario",
        email: u.email || u.userEmail || u.emailFull || u.userEmailMasked || "Sin correo",
        emailMasked: u.userEmailMasked || u.emailMasked || "Sin email"
      }));

      if (isLoadMore) {
        setItems(prev => [...prev, ...(res.items || [])]);
        setUsers(prev => [...prev, ...normalisedUsers]);
      } else {
        setItems(res.items || []);
        setUsers(normalisedUsers);
      }
      if (res.metrics) {
        setMetrics(res.metrics);
      }
      setNextCursor(res.nextCursor || null);

      if (import.meta.env.DEV === true) {
        console.debug("[AdminDiagnostics] raw response", res);
        console.debug("[AdminDiagnostics] users length", res?.users?.length);
        console.debug("[AdminDiagnostics] metrics", res?.metrics);
      }
    } catch (err: any) {
      if (err.message === "ADMIN_DIAGNOSTICS_API_RETURNED_HTML") {
        setError(`Error al cargar diagnósticos: El frontend recibió HTML. URL: ${lastRequestDebug.requestedUrl} | Status: ${lastRequestDebug.status} | Content-Type: ${lastRequestDebug.contentType}`);
      } else if (err.message === "ADMIN_DIAGNOSTICS_BY_USER_CONTRACT_MISSING_USERS") {
        setError("El endpoint view=by_user devolvió contrato de listado plano. Se esperaba users[].");
      } else {
        setError(err.message || "Error al cargar diagnósticos");
      }
    } finally {
      setLoading(false);
    }
  }, [filters, nextCursor]);

  useEffect(() => {
    fetchDiagnostics(false);
  }, [filters]);

  const applyFilters = (newFilters: DiagnosticsFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      cursor: undefined
    }));
  };

  const clearFilters = () => {
    setFilters(prev => ({ limit: 20, view: prev.view || "by_user" }));
  };

  const loadMore = () => {
    if (nextCursor && !loading) {
      fetchDiagnostics(true);
    }
  };

  const refresh = () => {
    fetchDiagnostics(false);
  };

  return {
    items,
    users,
    metrics,
    loading,
    error,
    filters,
    applyFilters,
    clearFilters,
    loadMore,
    refresh,
    hasMore: !!nextCursor
  };
};

