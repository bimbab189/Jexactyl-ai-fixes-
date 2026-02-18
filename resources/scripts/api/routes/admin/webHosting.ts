import http from '@/api/http';
import type { WebHostingSite } from '@/api/routes/server/webHosting';

export interface WebHostingSettings {
    backend_url: string;
    api_key: string;
    allowed_egg_ids: number[];
}

export interface WebHostingTargetOptions {
    nests: Array<{ id: number; uuid: string; name: string; description: string | null }>;
    eggs: Array<{
        id: number;
        uuid: string;
        nest_id: number;
        nest_name: string;
        name: string;
        description: string | null;
    }>;
}

export interface AdminWebHostingServerSummary {
    server_id: number;
    server_uuid: string;
    server_name: string;
    owner_id: number;
    site_count: number;
    bandwidth_bytes: number;
    requests: number;
    domains: string[];
    ips: string[];
    ports: number[];
    ssl_enabled_count: number;
}

export interface AdminWebHostingServerDetail {
    server_id: number;
    server_uuid: string;
    server_name: string;
    owner_id: number;
    site_limit: number | null;
    sites: WebHostingSite[];
}

export interface AdminWebHostingMeta {
    backend_reachable: boolean;
    backend_error: string | null;
}

export const getWebHostingSettings = async (): Promise<WebHostingSettings> => {
    const { data } = await http.get('/api/application/web-hosting/settings');

    return data.data;
};

export const updateWebHostingSettings = async (payload: WebHostingSettings): Promise<void> => {
    await http.put('/api/application/web-hosting/settings', payload);
};

export const getWebHostingTargetOptions = async (): Promise<WebHostingTargetOptions> => {
    const { data } = await http.get('/api/application/web-hosting/options');

    return data.data;
};

export const getWebHostingServers = async (): Promise<AdminWebHostingServerSummary[]> => {
    const { data } = await http.get('/api/application/web-hosting/servers');

    return data.data || [];
};

export const getWebHostingServer = async (
    serverId: number,
): Promise<{ data: AdminWebHostingServerDetail; meta: AdminWebHostingMeta }> => {
    const { data } = await http.get(`/api/application/web-hosting/servers/${serverId}`);

    return {
        data: data.data,
        meta: data.meta || { backend_reachable: true, backend_error: null },
    };
};

export const createWebHostingSite = async (
    serverId: number,
    payload: { ip: string; port: number; domain: string; ssl_enabled?: boolean; user_id?: number },
): Promise<{ data: WebHostingSite; meta: AdminWebHostingMeta }> => {
    const { data } = await http.post(`/api/application/web-hosting/servers/${serverId}/sites`, payload);

    return {
        data: data.data,
        meta: data.meta || { backend_reachable: true, backend_error: null },
    };
};

export const updateWebHostingSite = async (
    serverId: number,
    siteId: number,
    payload: Partial<{ ip: string; port: number; domain: string; ssl_enabled: boolean }>,
): Promise<{ data: WebHostingSite; meta: AdminWebHostingMeta }> => {
    const { data } = await http.put(`/api/application/web-hosting/servers/${serverId}/sites/${siteId}`, payload);

    return {
        data: data.data,
        meta: data.meta || { backend_reachable: true, backend_error: null },
    };
};

export const deleteWebHostingSite = async (serverId: number, siteId: number): Promise<void> => {
    await http.delete(`/api/application/web-hosting/servers/${serverId}/sites/${siteId}`);
};

export const setWebHostingSiteSsl = async (
    serverId: number,
    siteId: number,
    sslEnabled: boolean,
): Promise<{ data: WebHostingSite; meta: AdminWebHostingMeta }> => {
    const { data } = await http.post(`/api/application/web-hosting/servers/${serverId}/sites/${siteId}/ssl`, {
        ssl_enabled: sslEnabled,
    });

    return {
        data: data.data,
        meta: data.meta || { backend_reachable: true, backend_error: null },
    };
};

export const renewWebHostingSiteSsl = async (
    serverId: number,
    siteId: number,
    force = false,
): Promise<{ data: WebHostingSite; meta: AdminWebHostingMeta }> => {
    const { data } = await http.post(`/api/application/web-hosting/servers/${serverId}/sites/${siteId}/ssl/renew`, {
        force,
    });

    return {
        data: data.data,
        meta: data.meta || { backend_reachable: true, backend_error: null },
    };
};
