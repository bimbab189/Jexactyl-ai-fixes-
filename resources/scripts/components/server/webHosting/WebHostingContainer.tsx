import { useEffect, useMemo, useState } from 'react';
import tw from 'twin.macro';
import Input from '@/elements/Input';
import Select from '@/elements/Select';
import Spinner from '@/elements/Spinner';
import PageContentBlock from '@/elements/PageContentBlock';
import { Button } from '@/elements/button';
import useFlash, { useFlashKey } from '@/plugins/useFlash';
import { ServerContext } from '@/state/server';
import { useStoreState } from '@/state/hooks';
import {
    createServerWebHostingSite,
    deleteServerWebHostingSite,
    getServerWebHostingSites,
    renewServerWebHostingSsl,
    setServerWebHostingSsl,
    type WebHostingSite,
} from '@/api/routes/server/webHosting';

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

const WebHostingContainer = () => {
    const { colors } = useStoreState(state => state.theme.data!);
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid);
    const allocations = ServerContext.useStoreState(state => state.server.data!.allocations);

    const { clearFlashes, clearAndAddHttpError } = useFlashKey('server:web-hosting');
    const { addFlash } = useFlash();
    const { clearFlashes: clearGeneralFlashes } = useFlash();

    const [activeTab, setActiveTab] = useState<'analytics' | 'domains'>('analytics');
    const [loading, setLoading] = useState(false);
    const [domain, setDomain] = useState('');
    const [ip, setIp] = useState(allocations[0]?.ip || '');
    const [port, setPort] = useState(allocations[0]?.port || 80);
    const [sslEnabled, setSslEnabled] = useState(true);

    const { data, error, mutate } = getServerWebHostingSites();

    const rows = data?.data || [];
    const meta = data?.meta;

    const allocationPorts = useMemo(() => Array.from(new Set(allocations.map(item => item.port))), [allocations]);

    useEffect(() => {
        if (error) {
            clearAndAddHttpError(error);
        }
    }, [error]);

    const onCreate = async () => {
        clearFlashes();
        clearGeneralFlashes('server:web-hosting');
        setLoading(true);

        try {
            await createServerWebHostingSite(uuid, {
                domain: domain.trim().toLowerCase(),
                ip: ip.trim(),
                port,
                ssl_enabled: sslEnabled,
            });

            addFlash({
                key: 'server:web-hosting',
                type: 'success',
                message: 'Website entry has been created.',
            });

            setDomain('');
            await mutate();
        } catch (err) {
            clearAndAddHttpError(err as Error);
        } finally {
            setLoading(false);
        }
    };

    const onDelete = async (siteId: number) => {
        clearFlashes();

        try {
            await deleteServerWebHostingSite(uuid, siteId);
            await mutate();
        } catch (err) {
            clearAndAddHttpError(err as Error);
        }
    };

    const onToggleSsl = async (row: WebHostingSite) => {
        clearFlashes();

        try {
            await setServerWebHostingSsl(uuid, row.id, !row.ssl_enabled);
            await mutate();
        } catch (err) {
            clearAndAddHttpError(err as Error);
        }
    };

    const onRenewSsl = async (row: WebHostingSite) => {
        clearFlashes();

        try {
            await renewServerWebHostingSsl(uuid, row.id, true);
            await mutate();
        } catch (err) {
            clearAndAddHttpError(err as Error);
        }
    };

    return (
        <PageContentBlock
            title={'Web Hosting'}
            description={'Manage websites, domains, ports, SSL, and OpenResty analytics for this server.'}
            showFlashKey={'server:web-hosting'}
            header
        >
            {meta && !meta.backend_reachable && (
                <div css={tw`mb-6 rounded border border-red-700 bg-red-900/50 p-4 text-sm text-red-100`}>
                    OpenResty backend is unreachable. Panel actions still work locally and will continue to load.
                    {meta.backend_error ? ` (${meta.backend_error})` : ''}
                </div>
            )}

            <div css={tw`mb-4 flex items-center gap-2`}>
                <Button color={activeTab === 'analytics' ? 'primary' : 'secondary'} onClick={() => setActiveTab('analytics')}>
                    Analytics
                </Button>
                <Button color={activeTab === 'domains' ? 'primary' : 'secondary'} onClick={() => setActiveTab('domains')}>
                    Domains
                </Button>
            </div>

            {!data ? (
                <Spinner centered size={'large'} />
            ) : (
                <>
                    {activeTab === 'domains' && (
                        <div css={tw`mb-6 overflow-hidden rounded`} style={{ backgroundColor: colors.secondary }}>
                            <div css={tw`border-b border-black px-4 py-3 font-semibold text-neutral-100`} style={{ backgroundColor: colors.headers }}>
                                Add Domain / Port Mapping
                            </div>
                            <div css={tw`grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-5`}>
                                <Input
                                    value={domain}
                                    onChange={e => setDomain(e.currentTarget.value)}
                                    placeholder={'example.com'}
                                />
                                <Input value={ip} onChange={e => setIp(e.currentTarget.value)} placeholder={'10.0.0.5'} />
                                <Select value={port} onChange={e => setPort(Number(e.currentTarget.value))}>
                                    {allocationPorts.map(allocationPort => (
                                        <option key={allocationPort} value={allocationPort}>
                                            {allocationPort}
                                        </option>
                                    ))}
                                </Select>
                                <Select
                                    value={sslEnabled ? 'enabled' : 'disabled'}
                                    onChange={e => setSslEnabled(e.currentTarget.value === 'enabled')}
                                >
                                    <option value={'enabled'}>SSL Enabled</option>
                                    <option value={'disabled'}>SSL Disabled</option>
                                </Select>
                                <Button disabled={loading || !domain.trim() || !ip.trim()} onClick={onCreate}>
                                    Create
                                </Button>
                            </div>
                            <div css={tw`px-4 pb-4 text-xs text-neutral-400`}>
                                Limit: {meta?.site_limit === null || meta?.site_limit === undefined ? 'Unlimited' : `${rows.length}/${meta.site_limit}`}
                            </div>
                        </div>
                    )}

                    <div css={tw`space-y-3`}>
                        {rows.length < 1 && (
                            <div
                                css={tw`rounded border border-neutral-700 p-4 text-sm text-neutral-300`}
                                style={{ backgroundColor: colors.secondary }}
                            >
                                No web hosting entries configured for this server.
                            </div>
                        )}

                        {rows.map(row => (
                            <div
                                key={row.id}
                                css={tw`rounded border border-neutral-700 p-4`}
                                style={{ backgroundColor: colors.secondary }}
                            >
                                <div css={tw`flex flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
                                    <div>
                                        <div css={tw`text-sm font-semibold text-neutral-100`}>
                                            {row.domain} → {row.ip}:{row.port}
                                        </div>
                                        <div css={tw`text-xs text-neutral-400`}>
                                            SSL: {row.ssl_enabled ? 'Enabled' : 'Disabled'}
                                            {row.ssl_expires ? ` (expires ${formatDate(row.ssl_expires)})` : ''}
                                        </div>
                                        {row.last_error && <div css={tw`text-xs text-red-400`}>Last backend error: {row.last_error}</div>}
                                    </div>

                                    <div css={tw`flex items-center gap-2`}>
                                        <Button color={'secondary'} onClick={() => onToggleSsl(row)}>
                                            {row.ssl_enabled ? 'Disable SSL' : 'Enable SSL'}
                                        </Button>
                                        <Button color={'secondary'} onClick={() => onRenewSsl(row)}>
                                            Renew SSL
                                        </Button>
                                        <Button color={'secondary'} onClick={() => onDelete(row.id)}>
                                            Unlink
                                        </Button>
                                    </div>
                                </div>

                                {activeTab === 'analytics' && (
                                    <div css={tw`mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4`}>
                                        <div css={tw`rounded border border-neutral-700 p-2`}>
                                            <div css={tw`text-neutral-400`}>Requests</div>
                                            <div css={tw`text-neutral-100`}>{row.analytics.requests}</div>
                                        </div>
                                        <div css={tw`rounded border border-neutral-700 p-2`}>
                                            <div css={tw`text-neutral-400`}>Bandwidth</div>
                                            <div css={tw`text-neutral-100`}>{formatBytes(row.analytics.bytes_sent)}</div>
                                        </div>
                                        <div css={tw`rounded border border-neutral-700 p-2`}>
                                            <div css={tw`text-neutral-400`}>Status Codes</div>
                                            <div css={tw`text-neutral-100`}>
                                                2xx {row.analytics.status_2xx} · 3xx {row.analytics.status_3xx} · 4xx {row.analytics.status_4xx} · 5xx {row.analytics.status_5xx}
                                            </div>
                                        </div>
                                        <div css={tw`rounded border border-neutral-700 p-2`}>
                                            <div css={tw`text-neutral-400`}>Last Request</div>
                                            <div css={tw`text-neutral-100`}>{formatDate(row.analytics.last_request_ts)}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </PageContentBlock>
    );
};

export default WebHostingContainer;
