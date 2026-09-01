<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * TEMPORARY DIAGNOSTIC (remove once the suite is green again).
     *
     * The workspace this branch is being developed in has no PHP, no MySQL
     * and no access to the Actions log storage, so a failing backend suite
     * is a black box: the API exposes annotations but not the job log.
     * Echoing a GitHub workflow command turns failures into annotations,
     * which ARE readable. Annotations are capped per step, so the last
     * thing written is one line listing every failure, which is what
     * answers "did this branch add any?". Outside Actions this prints
     * nothing and behaves exactly like before.
     *
     * @var list<string>
     */
    private static array $failedTests = [];

    private static bool $summaryArmed = false;

    protected function onNotSuccessfulTest(\Throwable $t): never
    {
        if (getenv('GITHUB_ACTIONS')) {
            $message = str_replace(
                ["\r", "\n"],
                ['', ' ~ '],
                mb_substr($t->getMessage(), 0, 400),
            );
            self::$failedTests[] = $this->name();
            if (!self::$summaryArmed) {
                self::$summaryArmed = true;
                register_shutdown_function(static function (): void {
                    $names = implode(' | ', self::$failedTests);
                    $count = count(self::$failedTests);
                    fwrite(
                        STDOUT,
                        "\n::error::ALL FAILURES ({$count}): {$names}\n",
                    );
                });
            }
            if (count(self::$failedTests) <= 3) {
                fwrite(
                    STDOUT,
                    "\n::error::TEST {$this->name()} :: {$message}\n",
                );
            }
        }
        parent::onNotSuccessfulTest($t);
    }
}
