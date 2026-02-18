<?php

namespace Everest\Http\Controllers\Api\Client\Servers;

use Everest\Models\Server;
use Illuminate\Http\JsonResponse;
use Everest\Models\WebHostingSite;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Http\Requests\Api\Client\Servers\WebHosting\GetWebHostingRequest;
use Everest\Http\Requests\Api\Client\Servers\WebHosting\ManageWebHostingRequest;
use Everest\Services\WebHosting\OpenRestyWebHostingService;

class WebHostingController extends ClientApiController
{
    public function __construct(private OpenRestyWebHostingService $service)
    {
        parent::__construct();
    }

    public function index(GetWebHostingRequest $request, Server $server): JsonResponse
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
            'data' => $sites->map(fn (WebHostingSite $site) => $this->transformSite($site))->values(),
            'meta' => [
                'backend_reachable' => $backendReachable,
                'backend_error' => $backendError,
                'site_limit' => $server->subdomain_limit,
            ],
        ]);
    }

    public function store(ManageWebHostingRequest $request, Server $server): JsonResponse
    {
        $this->service->ensureServerCanUseModule($server);

        $payload = $request->validate([
            'ip' => ['required', 'ip'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'domain' => ['required', 'string', 'max:191'],
            'ssl_enabled' => ['sometimes', 'boolean'],
        ]);

        $siteLimit = $server->subdomain_limit;
        if ($siteLimit !== null && $server->webHostingSites()->count() >= $siteLimit) {
            abort(422, sprintf('Site limit reached (%d).', $siteLimit));
        }

        $site = WebHostingSite::query()->create([
            'server_id' => $server->id,
            'user_id' => $request->user()->id,
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

    public function update(ManageWebHostingRequest $request, Server $server, WebHostingSite $site): JsonResponse
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

    public function destroy(ManageWebHostingRequest $request, Server $server, WebHostingSite $site): JsonResponse
    {
        $this->service->ensureServerCanUseModule($server);
        $this->assertSiteBelongsToServer($site, $server);

        $result = $this->service->deleteRemoteSite($site);
        $site->delete();

        return response()->json([
            'message' => 'Site deleted.',
            'meta' => [
                'backend_reachable' => (bool) $result['reachable'],
                'backend_error' => $result['error'],
            ],
        ]);
    }

    public function ssl(ManageWebHostingRequest $request, Server $server, WebHostingSite $site): JsonResponse
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

    public function renewSsl(ManageWebHostingRequest $request, Server $server, WebHostingSite $site): JsonResponse
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
