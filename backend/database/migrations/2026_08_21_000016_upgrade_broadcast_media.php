<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::table('broadcasts', function (Blueprint $t) {
            $t->text('caption')->nullable()->after('message');
            $t->text('image_url')->nullable()->after('caption');
            $t->string('template')->nullable()->after('image_url');
        });
    }
    public function down(): void {}
};
