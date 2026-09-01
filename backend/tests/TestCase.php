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
     * Echoing a GitHub workflow command on failure turns each failed test
     * into an annotation, which IS readable — enough to see which test
     * failed and why. Outside Actions ($GITHUB_ACTIONS unset) this prints
     * nothing and behaves exactly like before.
     */
    protected function onNotSuccessfulTest(\Throwable $t): never
    {
        if (getenv('GITHUB_ACTIONS')) {
            $message = str_replace(
                ["\r", "\n"],
                ['', ' ~ '],
                mb_substr($t->getMessage(), 0, 900),
            );
            fwrite(
                STDOUT,
                "\n::error::TEST {$this->name()} :: {$message}\n",
            );
        }
        parent::onNotSuccessfulTest($t);
    }
}
