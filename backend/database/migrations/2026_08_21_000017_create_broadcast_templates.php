<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('broadcast_templates', function (Blueprint $t) {
            $t->id();
            $t->string('name', 120);
            $t->text('image_url');
            $t->text('caption');
            $t->timestamps();
            $t->index('name');
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('broadcast_templates');
    }
};
