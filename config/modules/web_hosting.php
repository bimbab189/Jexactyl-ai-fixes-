<?php

return [
    'enabled' => env('WEB_HOSTING_ENABLED', true),

    'backend' => [
        'url' => env('WEB_HOSTING_BACKEND_URL', 'http://127.0.0.1:8080/api'),
        'api_key' => env('WEB_HOSTING_BACKEND_API_KEY', ''),
        'timeout_seconds' => (int) env('WEB_HOSTING_BACKEND_TIMEOUT', 8),
    ],

    'egg' => [
        'name' => env('WEB_HOSTING_EGG_NAME', 'Web Hosting'),
        'ids' => array_values(array_filter(array_map('intval', array_filter(explode(',', (string) env('WEB_HOSTING_EGG_IDS', '')))))),
    ],
];
