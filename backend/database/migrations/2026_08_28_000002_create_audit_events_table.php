<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        // Employee-accountability audit trail: every discount, void, refund,
        // price override, cancellation and held-order conversion is recorded
        // with WHO did it, WHAT changed (before/after in details_json) and
        // WHEN. The employee name is snapshotted so the trail survives
        // account deactivation.
        Schema::create('audit_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('employee_id')
                ->nullable()
                ->constrained()
                ->nullOnDelete();
            $t->string('employee_name_snapshot');
            $t->string('action', 48)->index();
            $t->string('order_id', 32)->nullable()->index();
            $t->json('details_json')->nullable();
            $t->string('ip', 64)->nullable();
            $t->timestamp('created_at')->index();
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('audit_events');
    }
};
