<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Every simulated request authenticates from scratch. Sanctum's
     * RequestGuard caches the resolved user for the lifetime of the app
     * instance, which in a feature test spans every request the test makes:
     * the second request with a different bearer token (cashier after
     * admin, or no token after logout) was silently served as the FIRST
     * user, so 403/401 assertions on staff-boundary behaviour could not
     * observe the real middleware decision.
     */
    public function call(
        $method,
        $uri,
        $parameters = [],
        $cookies = [],
        $files = [],
        $server = [],
        $content = null,
    ) {
        $this->app['auth']->forgetGuards();
        return parent::call(
            $method,
            $uri,
            $parameters,
            $cookies,
            $files,
            $server,
            $content,
        );
    }
}
