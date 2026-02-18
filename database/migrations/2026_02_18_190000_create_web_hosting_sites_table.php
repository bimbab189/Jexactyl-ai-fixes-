<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('web_hosting_sites', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('user_id');
            $table->string('site_key')->unique();
            $table->string('ip', 64);
            $table->unsignedInteger('port');
            $table->string('domain');
            $table->boolean('ssl_enabled')->default(false);
            $table->timestamp('ssl_expires')->nullable();
            $table->unsignedBigInteger('requests')->default(0);
            $table->unsignedBigInteger('bytes_sent')->default(0);
            $table->unsignedBigInteger('status_2xx')->default(0);
            $table->unsignedBigInteger('status_3xx')->default(0);
            $table->unsignedBigInteger('status_4xx')->default(0);
            $table->unsignedBigInteger('status_5xx')->default(0);
            $table->timestamp('last_request_ts')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();

            $table->index(['server_id', 'domain']);
            $table->index(['server_id', 'port']);

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('web_hosting_sites');
    }
};
