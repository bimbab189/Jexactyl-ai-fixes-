<?php

namespace Everest\Services\WebHosting;

use Throwable;
use Carbon\Carbon;
use Everest\Models\Server;
use Everest\Models\Setting;
use Everest\Models\CustomDomain;
use Everest\Models\WebHostingSite;
use Illuminate\Support\Str;
use Illuminate\Support\Arr;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Everest\Services\CustomDomains\CloudflareDnsService;

class OpenRestyWebHostingService
{
    public function __construct(private CloudflareDnsService $cloudflareDnsService)
    {
    }

    public function isWebHostingServer(Server $server): bool
    {
        $server->loadMissing('egg');

        $configuredEggIds = $this->configuredEggIds();
        if (!empty($configuredEggIds)) {
            return in_array((int) $server->egg_id, $configuredEggIds, true);
        }

        $eggName = strtolower(trim((string) ($server->egg?->name ?? '')));
        $configuredName = strtolower(trim((string) config('modules.web_hosting.egg.name', 'Web Hosting')));

        if ($eggName !== '' && ($eggName === $configuredName || $eggName === 'web hosting')) {
            return true;
        }

        $features = collect((array) ($server->egg?->inherit_features ?? []))
            ->map(fn ($value) => strtolower(trim((string) $value)));

        return $features->contains(fn (string $feature) => in_array($feature, ['web-hosting', 'web_hosting', 'webhosting', 'web hosting'], true));
    }

    /**
     * @return array<int, int>
     */
    public function configuredEggIds(): array
    {
        $fromSettings = Setting::get('settings::modules:web_hosting:egg:ids');

        $decoded = [];
        if (is_array($fromSettings)) {
            $decoded = $fromSettings;
        } elseif (is_string($fromSettings) && trim($fromSettings) !== '') {
            $value = json_decode($fromSettings, true);
            if (is_array($value)) {
                $decoded = $value;
            }
        }

        if (empty($decoded)) {
            $decoded = (array) config('modules.web_hosting.egg.ids', []);
        }

        return array_values(array_unique(array_filter(array_map('intval', $decoded), fn (int $id) => $id > 0)));
    }

    public function generateSiteKey(Server $server, string $domain): string
    {
        $base = Str::slug($domain);
        $base = trim($base, '-');

        if ($base === '') {
            $base = 'site';
        }

        return sprintf('srv%s-%s-%s', $server->id, Str::limit($base, 24, ''), Str::lower(Str::random(6)));
    }

    public function ensureServerCanUseModule(Server $server): void
    {
        if (!$this->isWebHostingServer($server)) {
            abort(403, 'This server is not assigned to the Web Hosting egg.');
        }
    }

    public function createRemoteSite(WebHostingSite $site): array
    {
        return $this->request('post', '/sites', [
            'site_key' => $site->site_key,
            'user_id' => $site->user_id,
            'ip' => $site->ip,
            'port' => $site->port,
            'domain' => $site->domain,
            'ssl_enabled' => $site->ssl_enabled,
        ]);
    }

    public function updateRemoteSite(WebHostingSite $site): array
    {
        return $this->request('put', '/sites/' . rawurlencode($site->site_key), [
            'ip' => $site->ip,
            'port' => $site->port,
            'domain' => $site->domain,
            'ssl_enabled' => $site->ssl_enabled,
        ]);
    }

    public function deleteRemoteSite(WebHostingSite $site): array
    {
        return $this->request('delete', '/sites/' . rawurlencode($site->site_key));
    }

    public function toggleRemoteSsl(WebHostingSite $site, bool $enabled): array
    {
        return $this->request('post', '/sites/' . rawurlencode($site->site_key) . '/ssl', [
            'ssl_enabled' => $enabled,
        ]);
    }

    public function renewRemoteSsl(WebHostingSite $site, bool $force = false): array
    {
        return $this->request('post', '/sites/' . rawurlencode($site->site_key) . '/ssl/renew', [
            'force' => $force,
        ]);
    }

    public function fetchRemoteSite(WebHostingSite $site): array
    {
        return $this->request('get', '/sites/' . rawurlencode($site->site_key));
    }

    public function fetchRemoteAnalytics(WebHostingSite $site): array
    {
        return $this->request('get', '/analytics/' . rawurlencode($site->site_key));
    }

    public function fetchRemoteUserAnalytics(int $userId): array
    {
        return $this->request('get', '/analytics/user/' . $userId);
    }

    public function syncSiteFromRemote(WebHostingSite $site): array
    {
        $siteResponse = $this->fetchRemoteSite($site);

        if (!$siteResponse['ok']) {
            $analyticsResponse = $this->fetchRemoteAnalytics($site);
            if (!$analyticsResponse['ok']) {
                $site->last_error = $siteResponse['error'] ?: $analyticsResponse['error'];
                $site->last_synced_at = now();
                $site->save();

                return [
                    'ok' => false,
                    'reachable' => false,
                    'error' => $site->last_error,
                    'site' => $site,
                ];
            }

            $this->applyAnalyticsPayload($site, (array) ($analyticsResponse['data']['analytics'] ?? []));
            $site->last_error = null;
            $site->last_synced_at = now();
            $site->save();

            return [
                'ok' => true,
                'reachable' => true,
                'site' => $site,
            ];
        }

        $payload = (array) ($siteResponse['data'] ?? []);
        $analytics = (array) ($payload['analytics'] ?? []);

        $site->ip = (string) ($payload['ip'] ?? $site->ip);
        $site->port = (int) ($payload['port'] ?? $site->port);
        $site->domain = (string) ($payload['domain'] ?? $site->domain);
        $site->ssl_enabled = (bool) ($payload['ssl_enabled'] ?? $site->ssl_enabled);
        $site->ssl_expires = !empty($payload['ssl_expires']) ? Carbon::parse((string) $payload['ssl_expires']) : null;

        $this->applyAnalyticsPayload($site, $analytics);

        $site->last_error = null;
        $site->last_synced_at = now();
        $site->save();

        return [
            'ok' => true,
            'reachable' => true,
            'site' => $site,
        ];
    }

    public function provisionManagedARecord(string $domain, string $ip): void
    {
        try {
            $match = $this->findBestManagedDomainMatch($domain);
            if (!$match) {
                return;
            }

            if (empty($match->cloudflare_zone_id)) {
                return;
            }

            $token = trim((string) ($match->apiKey?->token ?? ''));

            $this->cloudflareDnsService->createOrUpdateAOrCnameRecord(
                (string) $match->cloudflare_zone_id,
                $domain,
                $ip,
                $token !== '' ? $token : null,
                'A',
                true,
            );
        } catch (Throwable) {
            // Non-fatal by design.
        }
    }

    private function findBestManagedDomainMatch(string $fullDomain): ?CustomDomain
    {
        $domain = strtolower(trim($fullDomain));

        if ($domain === '') {
            return null;
        }

        $candidates = CustomDomain::query()
            ->with('apiKey')
            ->where('enabled', true)
            ->orderByRaw('CHAR_LENGTH(domain) DESC')
            ->get();

        foreach ($candidates as $candidate) {
            $suffix = strtolower(trim((string) $candidate->domain));
            if ($suffix === '') {
                continue;
            }

            if ($domain === $suffix || str_ends_with($domain, '.' . $suffix)) {
                return $candidate;
            }
        }

        return null;
    }

    private function applyAnalyticsPayload(WebHostingSite $site, array $analytics): void
    {
        $site->requests = (int) Arr::get($analytics, 'requests', $site->requests ?? 0);
        $site->bytes_sent = (int) Arr::get($analytics, 'bytes_sent', $site->bytes_sent ?? 0);
        $site->status_2xx = (int) Arr::get($analytics, 'status_2xx', $site->status_2xx ?? 0);
        $site->status_3xx = (int) Arr::get($analytics, 'status_3xx', $site->status_3xx ?? 0);
        $site->status_4xx = (int) Arr::get($analytics, 'status_4xx', $site->status_4xx ?? 0);
        $site->status_5xx = (int) Arr::get($analytics, 'status_5xx', $site->status_5xx ?? 0);
        $site->last_request_ts = Arr::get($analytics, 'last_request_ts')
            ? Carbon::parse((string) Arr::get($analytics, 'last_request_ts'))
            : $site->last_request_ts;

        if (Arr::has($analytics, 'ssl_enabled')) {
            $site->ssl_enabled = (bool) Arr::get($analytics, 'ssl_enabled');
        }

        if (Arr::has($analytics, 'ssl_expires')) {
            $value = Arr::get($analytics, 'ssl_expires');
            $site->ssl_expires = $value ? Carbon::parse((string) $value) : null;
        }
    }

    private function request(string $method, string $path, ?array $payload = null): array
    {
        $url = $this->backendUrl() . '/' . ltrim($path, '/');

        try {
            $response = $this->client()->send(strtoupper($method), $url, $payload ? ['json' => $payload] : []);

            return $this->parseResponse($response);
        } catch (Throwable $exception) {
            return [
                'ok' => false,
                'reachable' => false,
                'error' => $exception->getMessage(),
                'data' => null,
            ];
        }
    }

    private function parseResponse(Response $response): array
    {
        $json = $response->json();
        $successFlag = is_array($json) ? ($json['success'] ?? true) : true;

        if (!$response->successful() || $successFlag === false) {
            $message = is_array($json) ? (string) ($json['message'] ?? '') : '';

            return [
                'ok' => false,
                'reachable' => true,
                'error' => $message !== '' ? $message : ('OpenResty request failed with status ' . $response->status()),
                'data' => is_array($json) ? $json : null,
            ];
        }

        return [
            'ok' => true,
            'reachable' => true,
            'error' => null,
            'data' => is_array($json) ? $json : null,
        ];
    }

    private function client()
    {
        $apiKey = $this->apiKey();

        return Http::acceptJson()
            ->asJson()
            ->timeout(max(1, (int) config('modules.web_hosting.backend.timeout_seconds', 8)))
            ->withHeaders([
                'X-API-Key' => $apiKey,
            ]);
    }

    private function backendUrl(): string
    {
        $configured = trim((string) Setting::get('settings::modules:web_hosting:backend:url', config('modules.web_hosting.backend.url', 'http://127.0.0.1:8080/api')));

        if ($configured === '') {
            $configured = 'http://127.0.0.1:8080/api';
        }

        if (!str_starts_with(strtolower($configured), 'http://') && !str_starts_with(strtolower($configured), 'https://')) {
            $configured = 'http://' . $configured;
        }

        return rtrim($configured, '/');
    }

    private function apiKey(): string
    {
        $value = trim((string) Setting::get('settings::modules:web_hosting:backend:api_key', config('modules.web_hosting.backend.api_key', '')));

        return $value;
    }
}
