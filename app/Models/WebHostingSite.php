<?php

namespace Everest\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebHostingSite extends Model
{
    public const RESOURCE_NAME = 'web_hosting_site';

    protected $table = 'web_hosting_sites';

    protected $guarded = ['id', self::CREATED_AT, self::UPDATED_AT];

    protected $casts = [
        'server_id' => 'integer',
        'user_id' => 'integer',
        'port' => 'integer',
        'ssl_enabled' => 'boolean',
        'bytes_sent' => 'integer',
        'requests' => 'integer',
        'status_2xx' => 'integer',
        'status_3xx' => 'integer',
        'status_4xx' => 'integer',
        'status_5xx' => 'integer',
        'ssl_expires' => 'datetime',
        'last_request_ts' => 'datetime',
        'last_synced_at' => 'datetime',
    ];

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'server_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
