<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        // The queue worker runs with --tries=3. When a job exhausts its
        // attempts Laravel hands it to the failed-job provider, which
        // config/queue.php points at the 'failed_jobs' table. Without this
        // table the recording INSERT throws "no such table: failed_jobs"
        // and the failure is lost with no trace of the dead job.
        if (!Schema::hasTable('failed_jobs')) {
            Schema::create('failed_jobs', function (Blueprint $t) {
                $t->id();
                $t->string('uuid')->unique();
                $t->text('connection');
                $t->text('queue');
                $t->longText('payload');
                $t->longText('exception');
                $t->timestamp('failed_at')->useCurrent();
            });
        }
    }
    public function down(): void
    {
        Schema::dropIfExists('failed_jobs');
    }
};
