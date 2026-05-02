import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const getToken = () => localStorage.getItem("netguard_token") || "";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

export const apiFetch = async (url: string, opts: RequestInit = {}) => {
  const res = await fetch(url, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw err;
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }
  return res.json().catch(() => null);
};

const extractId = (params: any): number => {
  if (typeof params === "number") return params;
  if (typeof params === "object" && params !== null) return params.id ?? params;
  return params;
};

const extractBody = (params: any): any =>
  params && typeof params === "object" && "data" in params ? params.data : params;

const getMutOpts = (opts: any) =>
  opts && typeof opts === "object" && "mutation" in opts ? opts.mutation : opts ?? {};

const getQueryOpts = (opts: any) =>
  opts && typeof opts === "object" && "query" in opts ? opts.query : opts ?? {};

export const useGetDevices = (opts?: any) =>
  useQuery({ queryKey: ["/api/devices"], queryFn: () => apiFetch("/api/devices"), ...getQueryOpts(opts) });

export const useCreateDevice = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch("/api/devices", { method: "POST", body: JSON.stringify(extractBody(params)) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/devices"] }),
    ...getMutOpts(opts),
  });
};

export const useUpdateDevice = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) => {
      const body = extractBody(params);
      const id = body?.id ?? extractId(params);
      const { id: _id, ...rest } = body ?? {};
      return apiFetch(`/api/devices/${id}`, { method: "PUT", body: JSON.stringify(rest) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/devices"] }),
    ...getMutOpts(opts),
  });
};

export const useDeleteDevice = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch(`/api/devices/${extractId(params)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/devices"] }),
    ...getMutOpts(opts),
  });
};

export const useTestDeviceSsh = (opts?: any) => {
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch(`/api/devices/${extractId(params)}/test-ssh`, { method: "POST" }),
    ...getMutOpts(opts),
  });
};

export const useGetAudits = (opts?: any) =>
  useQuery({ queryKey: ["/api/audits"], queryFn: () => apiFetch("/api/audits"), ...getQueryOpts(opts) });

export const useCreateAudit = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch("/api/audits", { method: "POST", body: JSON.stringify(extractBody(params)) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/audits"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    ...getMutOpts(opts),
  });
};

export const useRunAudit = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch(`/api/audits/${extractId(params)}/run`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/audits"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/results"] });
      qc.invalidateQueries({ queryKey: ["/api/corrections"] });
    },
    ...getMutOpts(opts),
  });
};

export const useDeleteAudit = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch(`/api/audits/${extractId(params)}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/audits"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    ...getMutOpts(opts),
  });
};

export const useGetResults = (params?: any) =>
  useQuery({
    queryKey: ["/api/results", params],
    queryFn: () =>
      apiFetch(
        "/api/results" +
          (params ? "?" + new URLSearchParams(params).toString() : "")
      ),
    refetchOnMount: "always",
    staleTime: 0,
  });

export const useGetCorrections = (opts?: any) =>
  useQuery({
    queryKey: ["/api/corrections"],
    queryFn: () => apiFetch("/api/corrections"),
    ...getQueryOpts(opts),
  });

export const useApplyCorrection = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch(`/api/corrections/${extractId(params)}/apply`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corrections"] });
      qc.invalidateQueries({ queryKey: ["/api/results"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    ...getMutOpts(opts),
  });
};

export const useIgnoreCorrection = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch(`/api/corrections/${extractId(params)}/ignore`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corrections"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    ...getMutOpts(opts),
  });
};

export const useGetDashboardStats = (opts?: any) =>
  useQuery({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => apiFetch("/api/dashboard/stats"),
    ...getQueryOpts(opts),
  });

export const useGetTopology = (opts?: any) =>
  useQuery({
    queryKey: ["/api/topology"],
    queryFn: () => apiFetch("/api/topology"),
    ...getQueryOpts(opts),
  });

export const useGetUsers = (opts?: any) =>
  useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiFetch("/api/users"),
    ...getQueryOpts(opts),
  });

export const useCreateUser = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch("/api/users", { method: "POST", body: JSON.stringify(extractBody(params)) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users"] }),
    ...getMutOpts(opts),
  });
};

export const useUpdateUser = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) => {
      const body = extractBody(params);
      const id = body?.id ?? extractId(params);
      const { id: _id, ...rest } = body ?? {};
      return apiFetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(rest) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users"] }),
    ...getMutOpts(opts),
  });
};

export const useDeleteUser = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch(`/api/users/${extractId(params)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users"] }),
    ...getMutOpts(opts),
  });
};

export const useGetScheduler = (opts?: any) =>
  useQuery({
    queryKey: ["/api/scheduler"],
    queryFn: () => apiFetch("/api/scheduler"),
    ...getQueryOpts(opts),
  });

export const useUpdateScheduler = (opts?: any) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch("/api/scheduler", { method: "PUT", body: JSON.stringify(extractBody(params)) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/scheduler"] }),
    ...getMutOpts(opts),
  });
};

export const useSshExecute = (opts?: any) => {
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch("/api/ssh/execute", { method: "POST", body: JSON.stringify(extractBody(params)) }),
    ...getMutOpts(opts),
  });
};

export const useLogin = (opts?: any) => {
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify(extractBody(params)) }),
    ...getMutOpts(opts),
  });
};

export const useVerifyAuth = (opts?: any) =>
  useQuery({
    queryKey: ["/api/auth/verify"],
    queryFn: () => apiFetch("/api/auth/verify"),
    retry: false,
    ...getQueryOpts(opts),
  });

export const useChangePassword = (opts?: any) => {
  return useMutation({
    mutationFn: (params: any) =>
      apiFetch("/api/auth/change-password", { method: "POST", body: JSON.stringify(extractBody(params)) }),
    ...getMutOpts(opts),
  });
};
