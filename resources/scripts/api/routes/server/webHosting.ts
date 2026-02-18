import useSWR from 'swr';
import http from '@/api/http';
import { ServerContext } from '@/state/server';

export interface WebHostingAnalytics {
    requests: number;
    bytes_sent: number;
    status_2xx: number;
    status_3xx: number;
    status_4xx: number;
    status_5xx: number;
    last_request_ts: string | null;
}

export interface WebHostingSite {
    id: number;
    site_key: string;
    server_id: number;
    user_id: number;
    ip: string;
    port: number;
    domain: string;
    ssl_enabled: boolean;
    ssl_expires: string | null;
    analytics: WebHostingAnalytics;
    last_synced_at: string | null;
    last_error: string | null;
}

export interface WebHostingMeta {
    backend_reachable: boolean;
    backend_error: string | null;
    site_limit: number | null;
}

export const getServerWebHostingSites = () => {
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid);

    return useSWR<{ data: WebHostingSite[]; meta: WebHostingMeta }>(
        ['server:web-hosting', uuid],
        async () => {
            const { data } = await http.get(`/api/client/servers/${uuid}/web-hosting`);

            return {
                data: data.data || [],
                meta: data.meta || { backend_reachable: true, backend_error: null, site_limit: null },
            };
        },
        { revalidateOnFocus: false },
    );
};

export const createServerWebHostingSite = async (
    uuid: string,
    payload: { ip: string; port: number; domain: string; ssl_enabled?: boolean },
): Promise<{ data: WebHostingSite; meta: WebHostingMeta }> => {
    const { data } = await http.post(`/api/client/servers/${uuid}/web-hosting`, payload);

    return {
        data: data.data,
        meta: data.meta || { backend_reachable: true, backend_error: null, site_limit: null },
    };
};

export const updateServerWebHostingSite = async (
    uuid: string,
    id: number,
    payload: Partial<{ ip: string; port: number; domain: string; ssl_enabled: boolean }>,
): Promise<{ data: WebHostingSite; meta: WebHostingMeta }> => {
    const { data } = await http.put(`/api/client/servers/${uuid}/web-hosting/${id}`, payload);

    return {
        data: data.data,
        meta: data.meta || { backend_reachable: true, backend_error: null, site_limit: null },
    };
};

export const deleteServerWebHostingSite = async (uuid: string, id: number): Promise<void> => {
    await http.delete(`/api/client/servers/${uuid}/web-hosting/${id}`);
};

export const setServerWebHostingSsl = async (
    uuid: string,
    id: number,
    sslEnabled: boolean,
): Promise<{ data: WebHostingSite; meta: WebHostingMeta }> => {
    const { data } = await http.post(`/api/client/servers/${uuid}/web-hosting/${id}/ssl`, { ssl_enabled: sslEnabled });

    return {
        data: data.data,
        meta: data.meta || { backend_reachable: true, backend_error: null, site_limit: null },
    };
};

export const renewServerWebHostingSsl = async (
    uuid: string,
    id: number,
    force = false,
): Promise<{ data: WebHostingSite; meta: WebHostingMeta }> => {
    const { data } = await http.post(`/api/client/servers/${uuid}/web-hosting/${id}/ssl/renew`, { force });

    return {
        data: data.data,
        meta: data.meta || { backend_reachable: true, backend_error: null, site_limit: null },
    };
};
