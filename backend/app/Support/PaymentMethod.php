<?php
namespace App\Support;
enum PaymentMethod:string { case CASH='cash'; case QR_MANUAL='qr_manual'; case KHQR_BAKONG_API='khqr_bakong_api'; case KHQR_ABA_API='khqr_aba_api'; case CARD='card'; case BANK_TRANSFER='bank_transfer'; }
