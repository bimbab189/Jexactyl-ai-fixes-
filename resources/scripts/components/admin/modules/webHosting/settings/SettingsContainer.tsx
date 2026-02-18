import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import Input from '@/elements/Input';
import SpinnerOverlay from '@/elements/SpinnerOverlay';
import { Button } from '@/elements/button';
import useFlash from '@/plugins/useFlash';
import { useStoreState } from '@/state/hooks';
import {
    getWebHostingSettings,
    getWebHostingTargetOptions,
    updateWebHostingSettings,
} from '@/api/routes/admin/webHosting';

export default () => {
    const { clearFlashes, clearAndAddHttpError, addFlash } = useFlash();
    const { colors } = useStoreState(state => state.theme.data!);

    const [loading, setLoading] = useState(false);
    const [backendUrl, setBackendUrl] = useState('http://127.0.0.1:8080/api');
    const [apiKey, setApiKey] = useState('');
    const [allowedEggIds, setAllowedEggIds] = useState<number[]>([]);
    const [selectedNestIds, setSelectedNestIds] = useState<number[]>([]);
    const [nests, setNests] = useState<Array<{ id: number; name: string }>>([]);
    const [eggs, setEggs] = useState<Array<{ id: number; name: string; nest_id: number; nest_name: string }>>([]);

    const toggleNest = (id: number) => {
        setSelectedNestIds(current => (current.includes(id) ? current.filter(item => item !== id) : current.concat(id)));
    };

    const toggleEgg = (id: number) => {
        setAllowedEggIds(current => (current.includes(id) ? current.filter(item => item !== id) : current.concat(id)));
    };

    const filteredEggs = eggs.filter(egg => selectedNestIds.length === 0 || selectedNestIds.includes(egg.nest_id));

    useEffect(() => {
        clearFlashes('admin:web-hosting');
        setLoading(true);

        Promise.all([getWebHostingSettings(), getWebHostingTargetOptions()])
            .then(([settings, options]) => {
                setBackendUrl(settings.backend_url || 'http://127.0.0.1:8080/api');
                setApiKey(settings.api_key || '');
                setAllowedEggIds(settings.allowed_egg_ids || []);

                setNests(options.nests.map(nest => ({ id: nest.id, name: nest.name })));
                setEggs(
                    options.eggs.map(egg => ({
                        id: egg.id,
                        name: egg.name,
                        nest_id: egg.nest_id,
                        nest_name: egg.nest_name || `Nest #${egg.nest_id}`,
                    })),
                );
            })
            .catch(error => clearAndAddHttpError({ key: 'admin:web-hosting', error }))
            .finally(() => setLoading(false));
    }, []);

    const onSave = async () => {
        clearFlashes('admin:web-hosting');
        setLoading(true);

        try {
            const sanitizedAllowedEggIds = Array.from(
                new Set(
                    allowedEggIds
                        .map(id => Number(id))
                        .filter(id => Number.isInteger(id) && id > 0),
                ),
            );

            await updateWebHostingSettings({
                backend_url: backendUrl.trim(),
                api_key: apiKey.trim(),
                allowed_egg_ids: sanitizedAllowedEggIds,
            });

            addFlash({
                key: 'admin:web-hosting',
                type: 'success',
                message: 'Web Hosting settings were saved.',
            });
        } catch (error) {
            clearAndAddHttpError({ key: 'admin:web-hosting', error });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <SpinnerOverlay visible={loading} />

            <div className={'rounded p-6'} style={{ backgroundColor: colors.secondary }}>
                <div className={'-mx-6 -mt-6 mb-4 rounded-t border-b border-black px-6 py-3'} style={{ backgroundColor: colors.headers }}>
                    <h3 className={'text-lg font-semibold text-neutral-100'}>OpenResty Backend</h3>
                </div>
                <p className={'mb-4 text-sm text-neutral-400'}>
                    Configure the internal OpenResty API endpoint and secret used for Web Hosting module integration.
                </p>

                <div className={'grid grid-cols-1 gap-3'}>
                    <div>
                        <label className={'mb-1 block text-xs text-neutral-400'}>Backend URL</label>
                        <Input
                            value={backendUrl}
                            onChange={e => setBackendUrl(e.currentTarget.value)}
                            placeholder={'http://127.0.0.1:8080/api'}
                        />
                    </div>
                    <div>
                        <label className={'mb-1 block text-xs text-neutral-400'}>API Key</label>
                        <Input
                            type={'password'}
                            value={apiKey}
                            onChange={e => setApiKey(e.currentTarget.value)}
                            placeholder={'OpenResty API key'}
                        />
                    </div>
                </div>

                <div className={'mt-6 rounded border border-neutral-700 p-4'} style={{ backgroundColor: colors.background }}>
                    <h4 className={'mb-2 text-sm font-medium text-neutral-100'}>Web Hosting Egg Selection</h4>
                    <p className={'mb-3 text-xs text-neutral-400'}>
                        Select exactly which eggs should be treated as Web Hosting eggs. If no eggs are selected, fallback auto-detection by egg name/features remains enabled.
                    </p>

                    <div className={'mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2'}>
                        <div className={'rounded border border-neutral-700 p-3'}>
                            <div className={'mb-2 flex items-center justify-between'}>
                                <h5 className={'text-xs font-semibold uppercase tracking-wide text-neutral-300'}>Nests</h5>
                                <div className={'space-x-2 text-xs'}>
                                    <button onClick={() => setSelectedNestIds(nests.map(nest => nest.id))} className={'text-neutral-400 hover:text-white'}>
                                        Select All
                                    </button>
                                    <span className={'text-neutral-600'}>|</span>
                                    <button onClick={() => setSelectedNestIds([])} className={'text-neutral-400 hover:text-white'}>
                                        Clear
                                    </button>
                                </div>
                            </div>

                            <div className={'grid gap-2 sm:grid-cols-2'}>
                                {nests.map(nest => (
                                    <label
                                        key={nest.id}
                                        className={classNames(
                                            'flex cursor-pointer items-center rounded border p-2 transition-colors',
                                            selectedNestIds.includes(nest.id) ? 'border-neutral-600 bg-neutral-700/20' : 'border-neutral-700',
                                        )}
                                    >
                                        <input
                                            type={'checkbox'}
                                            checked={selectedNestIds.includes(nest.id)}
                                            onChange={() => toggleNest(nest.id)}
                                            className={'sr-only'}
                                        />
                                        <div
                                            className={classNames(
                                                'mr-2 flex h-4 w-4 items-center justify-center rounded border',
                                                selectedNestIds.includes(nest.id) ? 'border-transparent' : 'border-neutral-500',
                                            )}
                                            style={selectedNestIds.includes(nest.id) ? { backgroundColor: colors.primary } : undefined}
                                        >
                                            {selectedNestIds.includes(nest.id) && <FontAwesomeIcon icon={faCheck} className={'text-[10px] text-white'} />}
                                        </div>
                                        <span className={'text-xs text-neutral-200'}>{nest.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className={'rounded border border-neutral-700 p-3'}>
                            <div className={'mb-2 flex items-center justify-between'}>
                                <h5 className={'text-xs font-semibold uppercase tracking-wide text-neutral-300'}>
                                    Eggs {selectedNestIds.length > 0 ? `(${filteredEggs.length})` : ''}
                                </h5>
                                <div className={'space-x-2 text-xs'}>
                                    <button onClick={() => setAllowedEggIds(filteredEggs.map(egg => egg.id))} className={'text-neutral-400 hover:text-white'}>
                                        Select All
                                    </button>
                                    <span className={'text-neutral-600'}>|</span>
                                    <button onClick={() => setAllowedEggIds([])} className={'text-neutral-400 hover:text-white'}>
                                        Clear
                                    </button>
                                </div>
                            </div>

                            {filteredEggs.length < 1 ? (
                                <div className={'py-3 text-center text-xs text-neutral-500'}>
                                    {selectedNestIds.length > 0 ? 'No eggs in selected nests.' : 'No eggs available.'}
                                </div>
                            ) : (
                                <div className={'grid gap-2 sm:grid-cols-2'}>
                                    {filteredEggs.map(egg => (
                                        <label
                                            key={egg.id}
                                            className={classNames(
                                                'flex cursor-pointer items-center rounded border p-2 transition-colors',
                                                allowedEggIds.includes(egg.id) ? 'border-neutral-600 bg-neutral-700/20' : 'border-neutral-700',
                                            )}
                                        >
                                            <input
                                                type={'checkbox'}
                                                checked={allowedEggIds.includes(egg.id)}
                                                onChange={() => toggleEgg(egg.id)}
                                                className={'sr-only'}
                                            />
                                            <div
                                                className={classNames(
                                                    'mr-2 flex h-4 w-4 items-center justify-center rounded border',
                                                    allowedEggIds.includes(egg.id) ? 'border-transparent' : 'border-neutral-500',
                                                )}
                                                style={allowedEggIds.includes(egg.id) ? { backgroundColor: colors.primary } : undefined}
                                            >
                                                {allowedEggIds.includes(egg.id) && <FontAwesomeIcon icon={faCheck} className={'text-[10px] text-white'} />}
                                            </div>
                                            <div>
                                                <div className={'text-xs text-neutral-200'}>{egg.name}</div>
                                                <div className={'text-[10px] text-neutral-500'}>{egg.nest_name}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={'mt-2 text-xs text-neutral-400'}>
                        Selected eggs: {allowedEggIds.length}
                    </div>
                </div>

                <div className={'mt-4'}>
                    <Button onClick={onSave} disabled={!backendUrl.trim()}>
                        Save Settings
                    </Button>
                </div>
            </div>
        </>
    );
};
