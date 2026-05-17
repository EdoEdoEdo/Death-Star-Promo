<?php

/**
 * Proxy server-side per Groq Chat Completions.
 * - La chiave API resta sul server (mai esposta al browser).
 * - Accetta solo POST con body JSON identico a Groq.
 * - Filtra Origin via ALLOWED_ORIGINS in config.php.
 */

declare(strict_types=1);

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Server misconfigured: missing config.php']);
    exit;
}
$cfg = require $configPath;

// --- CORS ----------------------------------------------------------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = $cfg['ALLOWED_ORIGINS'] ?? [];
if ($origin && in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Rifiuta richieste cross-origin non whitelisted (se Origin presente).
if ($origin && !in_array($origin, $allowed, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Origin not allowed']);
    exit;
}

$rawBody = file_get_contents('php://input');
if (!$rawBody) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty body']);
    exit;
}

$payload = json_decode($rawBody, true);
if (!is_array($payload) || empty($payload['messages'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid payload']);
    exit;
}

// Forza il modello dal config (l'utente non può cambiarlo dal client).
$payload['model'] = $cfg['GROQ_MODEL'] ?? 'llama-3.3-70b-versatile';
// Hard cap sui token per evitare abusi.
$payload['max_tokens'] = min((int) ($payload['max_tokens'] ?? 600), 1000);

$ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $cfg['GROQ_API_KEY'],
    ],
]);

$resp   = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err    = curl_error($ch);
curl_close($ch);

if ($resp === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream error', 'detail' => $err]);
    exit;
}

http_response_code($status ?: 200);
echo $resp;
