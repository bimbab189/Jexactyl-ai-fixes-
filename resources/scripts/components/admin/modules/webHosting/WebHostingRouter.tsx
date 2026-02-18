import { Route, Routes } from 'react-router-dom';
import { NotFound } from '@/elements/ScreenBlock';
import AdminContentBlock from '@/elements/AdminContentBlock';
import FlashMessageRender from '@/elements/FlashMessageRender';
import { SubNavigation, SubNavigationLink } from '@admin/SubNavigation';
import { CogIcon, CollectionIcon } from '@heroicons/react/outline';
import OverviewContainer from './overview/OverviewContainer';
import SettingsContainer from './settings/SettingsContainer';

export default () => {
    return (
        <AdminContentBlock title={'Web Hosting'}>
            <div className={'mb-8 flex w-full flex-row items-center'}>
                <div className={'flex flex-shrink flex-col'} style={{ minWidth: '0' }}>
                    <h2 className={'font-header text-2xl font-medium text-neutral-50'}>Web Hosting</h2>
                    <p className={'overflow-hidden overflow-ellipsis whitespace-nowrap text-base text-neutral-400'}>
                        Manage OpenResty-backed domain, port, SSL, and analytics integrations.
                    </p>
                </div>
            </div>

            <SubNavigation>
                <SubNavigationLink to={'/admin/web-hosting'} name={'Overview'} base>
                    <CollectionIcon />
                </SubNavigationLink>
                <SubNavigationLink to={'/admin/web-hosting/settings'} name={'Settings'}>
                    <CogIcon />
                </SubNavigationLink>
            </SubNavigation>

            <FlashMessageRender byKey={'admin:web-hosting'} className={'mb-4'} />

            <Routes>
                <Route path={'/'} element={<OverviewContainer />} />
                <Route path={'/settings'} element={<SettingsContainer />} />
                <Route path={'/*'} element={<NotFound />} />
            </Routes>
        </AdminContentBlock>
    );
};
