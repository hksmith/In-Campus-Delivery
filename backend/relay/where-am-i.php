<?php
/**
 * Test for the receipt relay host. Upload next to receipt-relay.php, open it in a browser,
 * read the result, then DELETE this file.
 * It shows the country of this server and whether it can reach the Telebirr / CBE receipt sites.
 */
header('Content-Type: text/plain; charset=utf-8');

function get($url, $insecure = false) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'Mozilla/5.0',
        CURLOPT_SSL_VERIFYPEER => !$insecure,
        CURLOPT_SSL_VERIFYHOST => $insecure ? 0 : 2,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$body, $code, $err];
}

[$info] = get('https://ipinfo.io/json');
$j = json_decode((string)$info, true) ?: [];
echo "This server's address: " . ($j['ip'] ?? '?') . "\n";
echo "Country: " . ($j['country'] ?? '?') . "   (needs to be ET)\n";
echo "City / company: " . ($j['city'] ?? '?') . " / " . ($j['org'] ?? '?') . "\n\n";

foreach ([
    'Telebirr' => ['https://transactioninfo.ethiotelecom.et/', false],
    'CBE' => ['https://apps.cbe.com.et:100/', true],
] as $name => [$url, $insecure]) {
    [$body, $code, $err] = get($url, $insecure);
    echo $name . ': ' . ($body !== false ? "REACHABLE (HTTP $code)" : "NOT reachable – $err") . "\n";
}
