<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    // TEMPORARY DEBUG INSTRUMENTATION — emit failing test names as GitHub
    // Actions annotations so they are readable via the API from sandboxes
    // that cannot download run logs. REVERT BEFORE MERGE.
    protected function onNotSuccessfulTest(\Throwable $t): never
    {
        if (getenv('GITHUB_ACTIONS') === 'true') {
            $name = static::class . '::' . $this->name();
            $message = mb_substr($t->getMessage(), 0, 400);
            $escape = fn(string $s): string =>
                str_replace(["\r", "\n", '%'], ['', '%0A', '%25'], $s);
            echo '::error title=PHPUnit ' .
                $escape($name) .
                '::' .
                $escape($message) .
                "\n";
        }
        throw $t;
    }
}
