<?php
/**
 * Receipt relay – upload this ONE file to any cheap web host INSIDE Ethiopia (cPanel/PHP).
 *
 * Why: transactioninfo.ethiotelecom.et (Telebirr) and apps.cbe.com.et (CBE) usually block
 * servers outside Ethiopia. Your backend (Render, Railway…) asks this relay to fetch the
 * official receipt for it.
 *
 * Setup:
 *   1. Change RELAY_KEY below to a long random string.
 *   2. Upload to e.g. https://your-et-host.com/receipt-relay.php
 *   3. In backend .env:
 *        VERIFY_RELAY_URL=https://your-et-host.com/receipt-relay.php
 *        VERIFY_RELAY_KEY=<the same random string>
 *
 * Security: only the two official receipt addresses are allowed, so it can't be abused as an open proxy.
 */

const RELAY_KEY = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';

$ALLOWED = [
    '#^https://transactioninfo\.ethiotelecom\.et/receipt/[A-Z0-9]{8,14}$#',
    '#^https://apps\.cbe\.com\.et:100/\?id=FT[A-Z0-9]{10}[0-9]{8}$#',
];

if (RELAY_KEY === 'CHANGE_ME_TO_A_LONG_RANDOM_STRING' || !hash_equals(RELAY_KEY, (string)($_GET['key'] ?? ''))) {
    http_response_code(403);
    exit('forbidden');
}

$url = (string)($_GET['url'] ?? '');
$ok = false;
foreach ($ALLOWED as $pattern) {
    if (preg_match($pattern, $url)) { $ok = true; break; }
}
if (!$ok) {
    http_response_code(400);
    exit('url not allowed');
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_TIMEOUT => 25,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    CURLOPT_HTTPHEADER => ['Accept: text/html,application/pdf,*/*;q=0.8', 'Accept-Language: en-US,en;q=0.9,am;q=0.8'],
    CURLOPT_SSL_VERIFYPEER => true,
]);
$body = curl_exec($ch);

// CBE's server is known to send an incomplete certificate chain – retry without verification
// ONLY for the CBE address (the receipt is still cross-checked by the backend).
if ($body === false && strpos($url, 'apps.cbe.com.et') !== false) {
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    $body = curl_exec($ch);
}

if ($body === false) {
    http_response_code(502);
    exit('upstream error: ' . curl_error($ch));
}

$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'application/octet-stream';
curl_close($ch);

http_response_code($status ?: 200);
header('Content-Type: ' . $type);
header('Cache-Control: no-store');
echo $body;
