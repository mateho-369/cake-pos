<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * TEMPORARY DIAGNOSTIC (removed once the suite is green).
     *
     * This branch is developed in a sandbox with no PHP, no MySQL and no
     * access to the Actions log storage, so a failing backend suite is a
     * black box: the API exposes annotations but not the job log. Collect
     * every failure and write them, with their messages, as a handful of
     * ::error:: workflow commands at shutdown — annotations ARE readable.
     * Outside Actions this prints nothing.
     *
     * @var array<string,string>
     */
    private static array $failures = [];

    private static bool $armed = false;

    protected function onNotSuccessfulTest(\Throwable $t): never
    {
        if (getenv('GITHUB_ACTIONS')) {
            self::$failures[$this->name()] = str_replace(
                ["\r", "\n"],
                ['', ' ~ '],
                mb_substr($t->getMessage(), 0, 420),
            );
            if (!self::$armed) {
                self::$armed = true;
                register_shutdown_function([self::class, 'dumpFailures']);
            }
        }
        parent::onNotSuccessfulTest($t);
    }

    public static function dumpFailures(): void
    {
        $total = count(self::$failures);
        $chunks = [];
        $current = '';
        foreach (self::$failures as $name => $message) {
            $line = "{$name} => {$message} ||| ";
            if (strlen($current) + strlen($line) > 2200) {
                $chunks[] = $current;
                $current = '';
            }
            $current .= $line;
        }
        if ($current !== '') {
            $chunks[] = $current;
        }
        foreach (array_slice($chunks, 0, 8) as $index => $chunk) {
            $part = $index + 1;
            fwrite(STDOUT, "\n::error::FAILURES {$part} of {$total}: {$chunk}\n");
        }
    }
}
