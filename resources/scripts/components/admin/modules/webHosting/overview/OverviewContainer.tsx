import { useEffect, useMemo, useState } from 'react';
import Input from '@/elements/Input';
import Select from '@/elements/Select';
import SpinnerOverlay from '@/elements/SpinnerOverlay';
import { Button } from '@/elements/button';
import useFlash from '@/plugins/useFlash';
import { useStoreState } from '@/state/hooks';
import {
    createWebHostingSite,
    deleteWebHostingSite,
    getWebHostingServer,
    getWebHostingServers,
    renewWebHostingSiteSsl,
    setWebHostingSiteSsl,
    type AdminWebHostingMeta,
    type AdminWebHostingServerDetail,
    type AdminWebHostingServerSummary,
} from '@/api/routes/admin/webHosting';

const formatBytes = (value: number) => {
    if (value < 1024) {
        return `${value} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value;
    let idx = -1;

    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx += 1;
    }

    return `${size.toFixed(2)} ${units[idx]}`;
};

const formatDate = (value: string | null) => {
    if (!value) return 'Never';

    return new Date(value).toLocaleString();
};

export default () => {
    const { colors } = useStoreState(state => state.theme.data!);
    const { clearFlashes, clearAndAddHttpError, addFlash } = useFlash();

    const [loading, setLoading] = useState(false);
    const [servers, setServers] = useState<AdminWebHostingServerSummary[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [selectedServer, setSelectedServer] = useState<AdminWebHostingServerDetail | null>(null);
    const [backendMeta, setBackendMeta] = useState<AdminWebHostingMeta>({ backend_reachable: true, backend_error: null });

    const [domain, setDomain] = useState('');
    const [ip, setIp] = useState('');
    const [port, setPort] = useState(80);
    const [sslEnabled, setSslEnabled] = useState(true);

    const selectedSummary = useMemo(
        () => servers.find(server => server.server_id === selectedServerId) || null,
        [servers, selectedServerId],
    );

    const refreshServers = async () => {
        const rows = await getWebHostingServers();
        setServers(rows);

        if (!selectedServerId && rows.length > 0 && rows[0]) {
            setSelectedServerId(rows[0].server_id);
        }
    };

    const refreshServer = async (serverId: number) => {
        const response = await getWebHostingServer(serverId);
        setSelectedServer(response.data);
        setBackendMeta(response.meta);

        if (!ip && response.data.sites.length > 0 && response.data.sites[0]) {
            setIp(response.data.sites[0].ip);
            setPort(response.data.sites[0].port);
        }
    };

    useEffect(() => {
        clearFlashes('admin:web-hosting');
        setLoading(true);

        refreshServers()
            .catch(error => clearAndAddHttpError({ key: 'admin:web-hosting', error }))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!selectedServerId) {
            return;
        }

        setLoading(true);
        refreshServer(selectedServerId)
            .catch(error => clearAndAddHttpError({ key: 'admin:web-hosting', error }))
            .finally(() => setLoading(false));
    }, [selectedServerId]);

    const onCreate = async () => {
        if (!selectedServerId) {
            return;
        }

        setLoading(true);
        clearFlashes('admin:web-hosting');

        try {
            const response = await createWebHostingSite(selectedServerId, {
                domain: domain.trim().toLowerCase(),
                ip: ip.trim(),
                port,
                ssl_enabled: sslEnabled,
            });

            setBackendMeta(response.meta);
            setDomain('');
            addFlash({ key: 'admin:web-hosting', type: 'success', message: 'Website entry created.' });
            await Promise.all([refreshServer(selectedServerId), refreshServers()]);
        } catch (error) {
            clearAndAddHttpError({ key: 'admin:web-hosting', error });
        } finally {
            setLoading(false);
        }
    };

    const onDelete = async (siteId: number) => {
        if (!selectedServerId) {
            return;
        }

        setLoading(true);
        clearFlashes('admin:web-hosting');

        try {
            await deleteWebHostingSite(selectedServerId, siteId);
            await Promise.all([refreshServer(selectedServerId), refreshServers()]);
        } catch (error) {
            clearAndAddHttpError({ key: 'admin:web-hosting', error });
        } finally {
            setLoading(false);
        }
    };

    const onToggleSsl = async (siteId: number, enabled: boolean) => {
        if (!selectedServerId) {
            return;
        }

        setLoading(true);

        try {
            const response = await setWebHostingSiteSsl(selectedServerId, siteId, !enabled);
            setBackendMeta(response.meta);
            await refreshServer(selectedServerId);
        } catch (error) {
            clearAndAddHttpError({ key: 'admin:web-hosting', error });
        } finally {
            setLoading(false);
        }
    };

    const onRenewSsl = async (siteId: number) => {
        if (!selectedServerId) {
            return;
        }

        setLoading(true);

        try {
            const response = await renewWebHostingSiteSsl(selectedServerId, siteId, true);
            setBackendMeta(response.meta);
            await refreshServer(selectedServerId);
        } catch (error) {
            clearAndAddHttpError({ key: 'admin:web-hosting', error });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <SpinnerOverlay visible={loading} />

            {backendMeta && !backendMeta.backend_reachable && (
                <div className={'mb-4 rounded border border-red-700 bg-red-900/50 p-4 text-sm text-red-100'}>
                    OpenResty backend is unreachable. Admin module remains available.
                    {backendMeta.backend_error ? ` (${backendMeta.backend_error})` : ''}
                </div>
            )}

            <div className={'grid grid-cols-1 gap-4 md:grid-cols-3'}>
                <div className={'rounded p-4'} style={{ backgroundColor: colors.secondary }}>
                    <div className={'mb-3 text-sm font-semibold text-neutral-100'}>Web Hosting Servers</div>
                    <div className={'space-y-2'}>
                        {servers.map(server => (
                            <button
                                key={server.server_id}
                                className={'w-full rounded border px-3 py-2 text-left'}
                                style={{
                                    backgroundColor: selectedServerId === server.server_id ? colors.headers : colors.background,
                                    borderColor: colors.headers,
                                }}
                                onClick={() => setSelectedServerId(server.server_id)}
                            >
                                <div className={'text-sm font-semibold text-neutral-100'}>{server.server_name}</div>
                                <div className={'text-xs text-neutral-400'}>
                                    {server.site_count} sites • {formatBytes(server.bandwidth_bytes)}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className={'rounded p-4 md:col-span-2'} style={{ backgroundColor: colors.secondary }}>
                    {!selectedServer ? (
                        <div className={'text-sm text-neutral-300'}>Select a server to inspect web hosting analytics.</div>
                    ) : (
                        <>
                            <div className={'mb-3'}>
                                <div className={'text-lg font-semibold text-neutral-100'}>{selectedServer.server_name}</div>
                                <div className={'text-xs text-neutral-400'}>
                                    Server ID {selectedServer.server_id} • Site limit:{' '}
                                    {selectedServer.site_limit === null ? 'Unlimited' : selectedServer.site_limit}
                                </div>
                            </div>

                            <div className={'mb-4 grid grid-cols-1 gap-3 md:grid-cols-4'}>
                                <div className={'rounded border border-neutral-700 p-3'}>
                                    <div className={'text-xs text-neutral-400'}>Total Sites</div>
                                    <div className={'text-sm text-neutral-100'}>{selectedServer.sites.length}</div>
                                </div>
                                <div className={'rounded border border-neutral-700 p-3'}>
                                    <div className={'text-xs text-neutral-400'}>Bandwidth</div>
                                    <div className={'text-sm text-neutral-100'}>
                                        {formatBytes(selectedServer.sites.reduce((sum, site) => sum + site.analytics.bytes_sent, 0))}
                                    </div>
                                </div>
                                <div className={'rounded border border-neutral-700 p-3'}>
                                    <div className={'text-xs text-neutral-400'}>Unique IPs</div>
                                    <div className={'text-sm text-neutral-100'}>{selectedSummary?.ips.length || 0}</div>
                                </div>
                                <div className={'rounded border border-neutral-700 p-3'}>
                                    <div className={'text-xs text-neutral-400'}>SSL Enabled</div>
                                    <div className={'text-sm text-neutral-100'}>
                                        {selectedServer.sites.filter(site => site.ssl_enabled).length}
                                    </div>
                                </div>
                            </div>

                            <div className={'mb-4 grid grid-cols-1 gap-3 md:grid-cols-5'}>
                                <Input value={domain} onChange={e => setDomain(e.currentTarget.value)} placeholder={'example.com'} />
                                <Input value={ip} onChange={e => setIp(e.currentTarget.value)} placeholder={'10.0.0.5'} />
                                <Input
                                    type={'number'}
                                    value={port}
                                    onChange={e => setPort(Number(e.currentTarget.value || 80))}
                                    min={1}
                                    max={65535}
                                />
                                <Select
                                    value={sslEnabled ? 'enabled' : 'disabled'}
                                    onChange={e => setSslEnabled(e.currentTarget.value === 'enabled')}
                                >
                                    <option value={'enabled'}>SSL Enabled</option>
                                    <option value={'disabled'}>SSL Disabled</option>
                                </Select>
                                <Button onClick={onCreate} disabled={!domain.trim() || !ip.trim()}>
                                    Add Site
                                </Button>
                            </div>

                            <div className={'space-y-2'}>
                                {selectedServer.sites.length < 1 && (
                                    <div className={'rounded border border-neutral-700 p-3 text-sm text-neutral-300'}>
                                        No website entries yet.
                                    </div>
                                )}

                                {selectedServer.sites.map(site => (
                                    <div key={site.id} className={'rounded border border-neutral-700 p-3'}>
                                        <div className={'flex flex-col gap-3 md:flex-row md:items-center md:justify-between'}>
                                            <div>
                                                <div className={'text-sm font-semibold text-neutral-100'}>
                                                    {site.domain} → {site.ip}:{site.port}
                                                </div>
                                                <div className={'text-xs text-neutral-400'}>
                                                    Requests {site.analytics.requests} • Bandwidth {formatBytes(site.analytics.bytes_sent)} • Last request {formatDate(site.analytics.last_request_ts)}
                                                </div>
                                                <div className={'text-xs text-neutral-400'}>
                                                    2xx {site.analytics.status_2xx} • 3xx {site.analytics.status_3xx} • 4xx {site.analytics.status_4xx} • 5xx {site.analytics.status_5xx}
                                                </div>
                                                {site.last_error && <div className={'text-xs text-red-400'}>Last backend error: {site.last_error}</div>}
                                            </div>

                                            <div className={'flex items-center gap-2'}>
                                                <Button color={'secondary'} onClick={() => onToggleSsl(site.id, site.ssl_enabled)}>
                                                    {site.ssl_enabled ? 'Disable SSL' : 'Enable SSL'}
                                                </Button>
                                                <Button color={'secondary'} onClick={() => onRenewSsl(site.id)}>
                                                    Renew SSL
                                                </Button>
                                                <Button color={'secondary'} onClick={() => onDelete(site.id)}>
                                                    Remove
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
};
