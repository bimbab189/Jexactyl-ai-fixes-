<?php

namespace Everest\Http\Controllers\Api\Application\WebHosting;

use Everest\Models\Egg;
use Everest\Models\Nest;
use Everest\Models\Server;
use Everest\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Everest\Models\WebHostingSite;
use Illuminate\Http\JsonResponse;
use Everest\Facades\Activity;
use Everest\Http\Controllers\Api\Application\ApplicationApiController;
use Everest\Services\WebHosting\OpenRestyWebHostingService;

class WebHostingController extends ApplicationApiController
{
    public function __construct(private OpenRestyWebHostingService $service)
    {
    }

    public function settings(Request $request): JsonResponse
    {
        return response()->json([
            'data' => [
                'backend_url' => (string) Setting::get('settings::modules:web_hosting:backend:url', config('modules.web_hosting.backend.url', 'http://127.0.0.1:8080/api')),
                'api_key' => (string) Setting::get('settings::modules:web_hosting:backend:api_key', config('modules.web_hosting.backend.api_key', '')),
                'allowed_egg_ids' => $this->service->configuredEggIds(),
            ],
        ]);
    }

    public function options(Request $request): JsonResponse
    {
        $nests = Nest::query()->orderBy('name')->get(['id', 'uuid', 'name', 'description']);
        $eggs = Egg::query()->with('nest:id,name')->orderBy('name')->get(['id', 'uuid', 'nest_id', 'name', 'description']);

        return response()->json([
            'data' => [
                'nests' => $nests,
                'eggs' => $eggs->map(function (Egg $egg) {
                    return [
                        'id' => $egg->id,
                        'uuid' => $egg->uuid,
                        'nest_id' => $egg->nest_id,
                        'nest_name' => $egg->nest?->name,
                        'name' => $egg->name,
                        'description' => $egg->description,
                    ];
                })->values(),
            ],
        ]);
    }

    public function updateSettings(Request $request): Response
    {
        $data = $request->validate([
            'backend_url' => ['required', 'string', 'max:255'],
            'api_key' => ['nullable', 'string', 'max:512'],
            'allowed_egg_ids' => ['sometimes', 'array'],
            'allowed_egg_ids.*' => ['integer', 'min:1'],
        ]);

        $requestedEggIds = array_values(array_unique(array_map('intval', (array) ($data['allowed_egg_ids'] ?? []))));
        $validEggIds = Egg::query()
            ->whereIn('id', $requestedEggIds)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        Setting::set('settings::modules:web_hosting:backend:url', trim((string) $data['backend_url']));
        Setting::set('settings::modules:web_hosting:backend:api_key', trim((string) ($data['api_key'] ?? '')));
        Setting::set(
            'settings::modules:web_hosting:egg:ids',
            json_encode($validEggIds)
        );

        Activity::event('admin:web-hosting:update-settings')
            ->description('Web Hosting settings were updated')
            ->log();

        return $this->returnNoContent();
    }

    public function servers(Request $request): JsonResponse
    {
        $servers = Server::query()
            ->with(['egg:id,name', 'webHostingSites'])
            ->orderBy('id', 'desc')
            ->get()
            ->filter(fn (Server $server) => $this->service->isWebHostingServer($server))
            ->values();

        return response()->json([
            'data' => $servers->map(function (Server $server) {
                $sites = $server->webHostingSites;

                return [
                    'server_id' => $server->id,
                    'server_uuid' => $server->uuid,
                    'server_name' => $server->name,
                    'owner_id' => $server->owner_id,
                    'site_count' => $sites->count(),
                    'bandwidth_bytes' => (int) $sites->sum('bytes_sent'),
                    'requests' => (int) $sites->sum('requests'),
                    'domains' => $sites->pluck('domain')->filter()->values(),
                    'ips' => $sites->pluck('ip')->filter()->unique()->values(),
                    'ports' => $sites->pluck('port')->filter()->unique()->values(),
                    'ssl_enabled_count' => (int) $sites->where('ssl_enabled', true)->count(),
                ];
            })->values(),
        ]);
    }

    public function server(Request $request, Server $server): JsonResponse
    {
        $this->service->ensureServerCanUseModule($server);

        $sites = $server->webHostingSites()->orderByDesc('id')->get();
        $backendReachable = true;
        $backendError = null;

        foreach ($sites as $site) {
            $result = $this->service->syncSiteFromRemote($site);
            if (!$result['ok']) {
                $backendReachable = false;
                $backendError = $result['error'];
            }
        }

        return response()->json([
            'data' => [
                'server_id' => $server->id,
                'server_uuid' => $server->uuid,
                'server_name' => $server->name,
                'owner_id' => $server->owner_id,
                'site_limit' => $server->subdomain_limit,
                'sites' => $sites->map(fn (WebHostingSite $site) => $this->transformSite($site))->values(),
            ],
            'meta' => [
                'backend_reachable' => $backendReachable,
                'backend_error' => $backendError,
            ],
        ]);
    }

    public function storeSite(Request $request, Server $server): JsonResponse
    {
        $this->service->ensureServerCanUseModule($server);

        $payload = $request->validate([
            'ip' => ['required', 'ip'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'domain' => ['required', 'string', 'max:191'],
            'ssl_enabled' => ['sometimes', 'boolean'],
            'user_id' => ['sometimes', 'integer', 'exists:users,id'],
        ]);

        $siteLimit = $server->subdomain_limit;
        if ($siteLimit !== null && $server->webHostingSites()->count() >= $siteLimit) {
            abort(422, sprintf('Site limit reached (%d).', $siteLimit));
        }

        $site = WebHostingSite::query()->create([
            'server_id' => $server->id,
            'user_id' => (int) ($payload['user_id'] ?? $server->owner_id),
            'site_key' => $this->service->generateSiteKey($server, (string) $payload['domain']),
            'ip' => (string) $payload['ip'],
            'port' => (int) $payload['port'],
            'domain' => strtolower((string) $payload['domain']),
            'ssl_enabled' => (bool) ($payload['ssl_enabled'] ?? false),
        ]);

        $result = $this->service->createRemoteSite($site);
        $this->service->provisionManagedARecord($site->domain, $site->ip);

        if ($result['ok']) {
            $this->service->syncSiteFromRemote($site);
        } else {
            $site->last_error = $result['error'];
            $site->last_synced_at = now();
            $site->save();
        }

        return response()->json([
            'data' => $this->transformSite($site->fresh()),
            'meta' => [
                'backend_reachable' => (bool) $result['reachable'],
                'backend_error' => $result['error'],
            ],
        ], JsonResponse::HTTP_CREATED);
    }

    public function updateSite(Request $request, Server $server, WebHostingSite $site): JsonResponse
    {
        $this->service->ensureServerCanUseModule($server);
        $this->assertSiteBelongsToServer($site, $server);

        $payload = $request->validate([
            'ip' => ['sometimes', 'ip'],
            'port' => ['sometimes', 'integer', 'min:1', 'max:65535'],
            'domain' => ['sometimes', 'string', 'max:191'],
            'ssl_enabled' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('ip', $payload)) {
            $site->ip = (string) $payload['ip'];
        }
        if (array_key_exists('port', $payload)) {
            $site->port = (int) $payload['port'];
        }
        if (array_key_exists('domain', $payload)) {
            $site->domain = strtolower((string) $payload['domain']);
        }
        if (array_key_exists('ssl_enabled', $payload)) {
            $site->ssl_enabled = (bool) $payload['ssl_enabled'];
        }

        $site->save();

        $result = $this->service->updateRemoteSite($site);
        $this->service->provisionManagedARecord($site->domain, $site->ip);

        if ($result['ok']) {
            $this->service->syncSiteFromRemote($site);
        } else {
            $site->last_error = $result['error'];
            $site->last_synced_at = now();
            $site->save();
        }

        return response()->json([
            'data' => $this->transformSite($site->fresh()),
            'meta' => [
                'backend_reachable' => (bool) $result['reachable'],
                'backend_error' => $result['error'],
            ],
        ]);
    }

    public function deleteSite(Request $request, Server $server, WebHostingSite $site): Response
    {
        $this->service->ensureServerCanUseModule($server);
        $this->assertSiteBelongsToServer($site, $server);

        $this->service->deleteRemoteSite($site);
        $site->delete();

        return $this->returnNoContent();
    }

    public function ssl(Request $request, Server $server, WebHostingSite $site): JsonResponse
    {
        $this->service->ensureServerCanUseModule($server);
        $this->assertSiteBelongsToServer($site, $server);

        $data = $request->validate([
            'ssl_enabled' => ['required', 'boolean'],
        ]);

        $site->ssl_enabled = (bool) $data['ssl_enabled'];
        $site->save();

        $result = $this->service->toggleRemoteSsl($site, $site->ssl_enabled);

        if ($result['ok']) {
            $this->service->syncSiteFromRemote($site);
        }

        return response()->json([
            'data' => $this->transformSite($site->fresh()),
            'meta' => [
                'backend_reachable' => (bool) $result['reachable'],
                'backend_error' => $result['error'],
            ],
        ]);
    }

    public function renewSsl(Request $request, Server $server, WebHostingSite $site): JsonResponse
    {
        $this->service->ensureServerCanUseModule($server);
        $this->assertSiteBelongsToServer($site, $server);

        $data = $request->validate([
            'force' => ['sometimes', 'boolean'],
        ]);

        $result = $this->service->renewRemoteSsl($site, (bool) ($data['force'] ?? false));

        if ($result['ok']) {
            $this->service->syncSiteFromRemote($site);
        }

        return response()->json([
            'data' => $this->transformSite($site->fresh()),
            'meta' => [
                'backend_reachable' => (bool) $result['reachable'],
                'backend_error' => $result['error'],
            ],
        ]);
    }

    private function assertSiteBelongsToServer(WebHostingSite $site, Server $server): void
    {
        if ($site->server_id !== $server->id) {
            abort(404);
        }
    }

    private function transformSite(WebHostingSite $site): array
    {
        return [
            'id' => $site->id,
            'site_key' => $site->site_key,
            'server_id' => $site->server_id,
            'user_id' => $site->user_id,
            'ip' => $site->ip,
            'port' => $site->port,
            'domain' => $site->domain,
            'ssl_enabled' => $site->ssl_enabled,
            'ssl_expires' => optional($site->ssl_expires)->toISOString(),
            'analytics' => [
                'requests' => (int) $site->requests,
                'bytes_sent' => (int) $site->bytes_sent,
                'status_2xx' => (int) $site->status_2xx,
                'status_3xx' => (int) $site->status_3xx,
                'status_4xx' => (int) $site->status_4xx,
                'status_5xx' => (int) $site->status_5xx,
                'last_request_ts' => optional($site->last_request_ts)->toISOString(),
            ],
            'last_synced_at' => optional($site->last_synced_at)->toISOString(),
            'last_error' => $site->last_error,
        ];
    }
}
