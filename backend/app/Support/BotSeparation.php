<?php
namespace App\Support;
final class BotSeparation
{
    public static function assertDistinct(?string $sale, ?string $shop): void
    {
        if (
            $sale &&
            $shop &&
            strcasecmp(ltrim($sale, '@'), ltrim($shop, '@')) === 0
        ) {
            throw new \RuntimeException(
                'apps/sale and apps/shop must use separate Telegram bots',
            );
        }
    }
}
