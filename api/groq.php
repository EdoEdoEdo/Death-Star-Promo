<?php

/**
 * Master Lucas — proxy server-side per la chat del DS-1 (Aruba, PHP 7.4+).
 *
 * v2 (11/2026)
 *  - Il browser manda solo { history, message }: prompt di sistema,
 *    contesto SWAPI, modello e limiti stanno qui. Prima il client inviava
 *    l'intera conversazione (prompt compreso) e il proxy la inoltrava a
 *    Groq cosi' com'era: chiunque con curl poteva usarlo per qualsiasi cosa.
 *  - Modello: openai/gpt-oss-120b (llama-3.3-70b-versatile e' stato spento
 *    da Groq il 16/08/2026). reasoning_effort "low", reasoning escluso.
 *  - Fallback opzionale su Mistral se in config.php c'e' MISTRAL_API_KEY.
 *  - SWAPI interrogato da qui, con cache su file di 24 ore.
 *  - Rate limit per IP su file (RATE_LIMIT richieste ogni RATE_WINDOW s).
 *  - Compatibile con il client v1 (body con "messages").
 */

declare(strict_types=1);

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_MISTRAL_MODEL = 'mistral-small-2603';
const RETIRED_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'qwen/qwen3-32b',
    'qwen/qwen3.6-27b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
];
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const SWAPI_BASE = 'https://swapi.info/api';

const MAX_BODY = 24000;      // byte
const MAX_MESSAGE = 600;     // caratteri
const MAX_HISTORY = 10;      // messaggi
const MAX_HISTORY_CHARS = 1500;
const RATE_LIMIT = 20;       // richieste...
const RATE_WINDOW = 600;     // ...ogni 10 minuti, per IP
const SWAPI_TTL = 86400;
const SWAPI_CONTEXT_CHARS = 6000;

const SYSTEM_PROMPT = <<<TXT
You are "Master Lucas", an expert narrator of the Star Wars universe, inspired by George Lucas.
You live inside the "DS-1 Orbital Battle Station" website: a tongue-in-cheek luxury brochure in which the Galactic Empire sells the Death Star ("Planetary shutdown as a service", "Book your test drive", "starting at 1 planet per month"). Visitors reach you from the "Talk to an advisor" button.
Style: passionate, slightly grandiose, fond of mythological digressions and parallels with Joseph Campbell. Warm, authoritative, a bit nostalgic. Emojis only when truly fitting.
If the visitor plays along with the brochure (prices, test drives, warranties), answer that joke in one witty sentence, then give them real Star Wars knowledge.
Always answer in English, unless the visitor writes in another language: then answer in theirs.
If you are not sure about a canon fact, say so and give the most accredited version (Disney canon), distinguishing it from Legends.
When SWAPI data is provided, use it precisely. Never invent precise numbers: if they are missing, say you cannot tell for sure.
Ideal length: 4-8 sentences. Plain text, no markdown headings or tables.
TXT;

// ───────────────────────────── utilita' ─────────────────────────────

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function str_cut(string $s, int $max): string
{
    if (function_exists('mb_substr')) return mb_substr($s, 0, $max, 'UTF-8');
    return substr($s, 0, $max);
}

function host_only(string $h): string
{
    $h = strtolower(trim($h));
    $p = strpos($h, ':');
    return $p === false ? $h : substr($h, 0, $p);
}

function cache_dir(): ?string
{
    $dir = __DIR__ . '/.cache';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_dir($dir) && is_writable($dir)) {
        $ht = $dir . '/.htaccess';
        if (!file_exists($ht)) @file_put_contents($ht, "Require all denied\n");
        return $dir;
    }
    $tmp = rtrim(sys_get_temp_dir(), '/') . '/ds1-holocron';
    if (!is_dir($tmp)) @mkdir($tmp, 0700, true);
    return (is_dir($tmp) && is_writable($tmp)) ? $tmp : null;
}

/** Rate limit a finestra scorrevole, un file per IP (hash). */
function rate_limited(?string $dir, string $ip): int
{
    if ($dir === null || $ip === '') return 0;
    $file = $dir . '/rl-' . sha1($ip) . '.json';
    $fh = @fopen($file, 'c+');
    if (!$fh) return 0;
    $wait = 0;
    if (flock($fh, LOCK_EX)) {
        $now = time();
        $raw = stream_get_contents($fh);
        $hits = json_decode($raw ?: '[]', true);
        if (!is_array($hits)) $hits = [];
        $hits = array_values(array_filter($hits, function ($t) use ($now) {
            return is_int($t) && $t > $now - RATE_WINDOW;
        }));
        if (count($hits) >= RATE_LIMIT) {
            $wait = max(1, $hits[0] + RATE_WINDOW - $now);
        } else {
            $hits[] = $now;
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($hits));
        fflush($fh);
        flock($fh, LOCK_UN);
    }
    fclose($fh);
    return $wait;
}

function http_json(string $url, ?array $payload, array $headers, int $timeout): array
{
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_HTTPHEADER => $headers,
    ];
    if ($payload !== null) {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE);
    }
    curl_setopt_array($ch, $opts);
    $resp = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$status, $resp === false ? null : $resp, $err];
}

// ───────────────────────────── SWAPI ─────────────────────────────

function swapi_list(string $resource, ?string $dir): array
{
    $file = $dir ? $dir . '/swapi-' . $resource . '.json' : null;
    if ($file && is_file($file) && filemtime($file) > time() - SWAPI_TTL) {
        $data = json_decode((string) file_get_contents($file), true);
        if (is_array($data)) return $data;
    }
    [$status, $body] = http_json(SWAPI_BASE . '/' . $resource, null, ['Accept: application/json'], 8);
    if ($status !== 200 || $body === null) return [];
    $data = json_decode($body, true);
    if (!is_array($data) || !$data) return [];
    if ($file) @file_put_contents($file, $body, LOCK_EX);
    return $data;
}

/** Tiene solo i campi scalari (via gli array di URL): meno token. */
function swapi_slim(array $item): array
{
    $out = [];
    foreach ($item as $k => $v) {
        if (is_scalar($v) && !in_array($k, ['url', 'created', 'edited'], true)) $out[$k] = $v;
    }
    return $out;
}

function swapi_context(string $msg, ?string $dir): string
{
    $lower = strtolower($msg);
    $topics = [];
    $map = [
        ['/(pianeta|planet|tatooine|naboo|hoth|endor|coruscant|dagobah|alderaan|yavin|bespin|kashyyyk|geonosis|kamino|mustafar|scarif)/', 'planets'],
        ['/(film|episodio|episode|movie)/', 'films'],
        ['/(astronav|starship|millennium|falcon|x-?wing|tie|destroyer|death star|morte nera|shuttle)/', 'starships'],
        ['/(specie|species|wookiee|ewok|rodian|twi\'?lek|hutt|gungan)/', 'species'],
        ['/(veicolo|vehicle|speeder|at-?at|at-?st|sandcrawler)/', 'vehicles'],
    ];
    foreach ($map as [$re, $res]) {
        if (preg_match($re, $lower, $m)) $topics[] = [$res, $m[1]];
    }

    // nomi propri (i piu' specifici, vanno per primi): parole con iniziale
    // maiuscola che non sono parole comuni ne' gia' coperte da un tema
    $stop = ['the', 'tell', 'who', 'what', 'how', 'why', 'when', 'where', 'is', 'are', 'was', 'were', 'can', 'could',
        'do', 'does', 'did', 'and', 'but', 'master', 'lucas', 'star', 'wars', 'please', 'hi', 'hello', 'ds-1', 'empire',
        'galactic', 'jedi', 'sith', 'force', 'i', 'my', 'which', 'chi', 'cosa', 'come', 'perche', 'quando', 'dove',
        'raccontami', 'parlami', 'dimmi', 'il', 'la', 'lo', 'gli', 'le', 'un', 'una', 'death', 'planet', 'episode'];
    $people = [];
    if (preg_match_all('/\b([A-Z][a-zA-Z\'\-]{2,}(?:\s[A-Z][a-zA-Z\'\-]{2,})?)/u', $msg, $mm)) {
        foreach ($mm[1] as $name) {
            $n = strtolower($name);
            if (in_array($n, $stop, true)) continue;
            foreach ($map as [$re]) {
                if (preg_match($re, $n)) continue 2;
            }
            $people[] = ['people', $n];
            if (count($people) >= 2) break;
        }
    }
    $queries = array_slice(array_merge($people, $topics), 0, 4);
    if (!$queries) return '';

    $blocks = [];
    $done = [];
    foreach ($queries as [$res, $q]) {
        $key = $res . '|' . $q;
        if (isset($done[$key])) continue;
        $done[$key] = true;
        $hits = [];
        foreach (swapi_list($res, $dir) as $item) {
            if (!is_array($item)) continue;
            $name = strtolower((string) ($item['name'] ?? $item['title'] ?? ''));
            if ($name !== '' && strpos($name, $q) !== false) {
                $hits[] = swapi_slim($item);
                if (count($hits) >= 3) break;
            }
        }
        if ($hits) $blocks[] = '## ' . $res . ' ~ "' . $q . "\"\n" . json_encode($hits, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    return str_cut(implode("\n\n", $blocks), SWAPI_CONTEXT_CHARS);
}

// ───────────────────────────── provider ─────────────────────────────

function call_groq(array $cfg, array $messages, string &$err): ?string
{
    $key = (string) ($cfg['GROQ_API_KEY'] ?? '');
    if ($key === '' || strpos($key, 'REPLACE') !== false) {
        $err = 'groq: missing key';
        return null;
    }
    $model = (string) ($cfg['GROQ_MODEL'] ?? '');
    if ($model === '' || in_array($model, RETIRED_MODELS, true)) $model = DEFAULT_MODEL;
    $payload = [
        'model' => $model,
        'messages' => $messages,
        'temperature' => 0.8,
        'max_completion_tokens' => 1000,
    ];
    if (strpos($model, 'openai/gpt-oss') === 0) {
        $payload['reasoning_effort'] = 'low';
        $payload['include_reasoning'] = false;
    }
    [$status, $body, $cerr] = http_json(GROQ_URL, $payload, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $key,
    ], 30);
    if ($status !== 200 || $body === null) {
        $err = 'groq: HTTP ' . $status . ' ' . ($cerr ?: str_cut((string) $body, 300));
        return null;
    }
    $data = json_decode($body, true);
    $text = trim((string) ($data['choices'][0]['message']['content'] ?? ''));
    if ($text === '') {
        $err = 'groq: empty content (' . ($data['choices'][0]['finish_reason'] ?? '?') . ')';
        return null;
    }
    return $text;
}

function call_mistral(array $cfg, array $messages, string &$err): ?string
{
    $key = (string) ($cfg['MISTRAL_API_KEY'] ?? '');
    if ($key === '') return null;
    $payload = [
        'model' => (string) ($cfg['MISTRAL_MODEL'] ?? DEFAULT_MISTRAL_MODEL),
        'messages' => $messages,
        'temperature' => 0.8,
        'max_tokens' => 700,
    ];
    [$status, $body, $cerr] = http_json(MISTRAL_URL, $payload, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $key,
    ], 30);
    if ($status !== 200 || $body === null) {
        $err .= ' | mistral: HTTP ' . $status . ' ' . ($cerr ?: str_cut((string) $body, 300));
        return null;
    }
    $data = json_decode($body, true);
    $text = trim((string) ($data['choices'][0]['message']['content'] ?? ''));
    return $text === '' ? null : $text;
}

// ───────────────────────────── richiesta ─────────────────────────────

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) respond(500, ['error' => 'Server misconfigured: missing config.php']);
$cfg = require $configPath;
if (!is_array($cfg)) respond(500, ['error' => 'Server misconfigured: invalid config.php']);

// --- origine ---------------------------------------------------------------
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$allowed = (array) ($cfg['ALLOWED_ORIGINS'] ?? []);
$host = host_only((string) ($_SERVER['HTTP_HOST'] ?? ''));
$allowedHosts = array_map(function ($o) {
    return host_only((string) parse_url((string) $o, PHP_URL_HOST));
}, $allowed);
$originOk = $origin !== '' && (in_array($origin, $allowed, true) || host_only((string) parse_url($origin, PHP_URL_HOST)) === $host);

if ($origin !== '' && in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? '');
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'POST') respond(405, ['error' => 'Method not allowed']);

if ($origin !== '') {
    if (!$originOk) respond(403, ['error' => 'Origin not allowed']);
} else {
    // niente Origin (es. curl): serve almeno un Referer del sito
    $refHost = host_only((string) parse_url((string) ($_SERVER['HTTP_REFERER'] ?? ''), PHP_URL_HOST));
    if ($refHost === '' || ($refHost !== $host && !in_array($refHost, $allowedHosts, true))) {
        respond(403, ['error' => 'Origin not allowed']);
    }
}

// --- rate limit --------------------------------------------------------------
$dir = cache_dir();
$wait = rate_limited($dir, (string) ($_SERVER['REMOTE_ADDR'] ?? ''));
if ($wait > 0) {
    header('Retry-After: ' . $wait);
    respond(429, ['error' => 'Too many requests', 'retryAfter' => $wait]);
}

// --- input -----------------------------------------------------------------
$raw = (string) file_get_contents('php://input');
if ($raw === '') respond(400, ['error' => 'Empty body']);
if (strlen($raw) > MAX_BODY) respond(413, ['error' => 'Payload too large']);
$in = json_decode($raw, true);
if (!is_array($in)) respond(400, ['error' => 'Invalid JSON']);

$history = [];
$message = '';
if (isset($in['message'])) {
    $message = trim((string) $in['message']);
    $history = is_array($in['history'] ?? null) ? $in['history'] : [];
} elseif (isset($in['messages']) && is_array($in['messages'])) {
    // client v1: { messages: [system?, ...history, user] }
    $msgs = array_values(array_filter($in['messages'], function ($m) {
        return is_array($m) && in_array($m['role'] ?? '', ['user', 'assistant'], true);
    }));
    $last = array_pop($msgs);
    if (is_array($last) && ($last['role'] ?? '') === 'user') $message = trim((string) ($last['content'] ?? ''));
    $history = $msgs;
}
if ($message === '') respond(400, ['error' => 'Empty message']);
$message = str_cut($message, MAX_MESSAGE);

$clean = [];
foreach (array_slice($history, -MAX_HISTORY) as $m) {
    if (!is_array($m)) continue;
    $role = $m['role'] ?? '';
    $content = trim((string) ($m['content'] ?? ''));
    if (!in_array($role, ['user', 'assistant'], true) || $content === '') continue;
    $clean[] = ['role' => $role, 'content' => str_cut($content, MAX_HISTORY_CHARS)];
}

// --- prompt ----------------------------------------------------------------
$context = swapi_context($message, $dir);
$system = SYSTEM_PROMPT . ($context !== '' ? "\n\nSWAPI DATA (canonical records, cite precisely):\n" . $context : '');
$messages = array_merge([['role' => 'system', 'content' => $system]], $clean, [['role' => 'user', 'content' => $message]]);

// --- provider: Groq, poi Mistral se configurato -------------------------------
$err = '';
$reply = call_groq($cfg, $messages, $err);
$provider = 'groq';
if ($reply === null) {
    $reply = call_mistral($cfg, $messages, $err);
    $provider = 'mistral';
}
if ($reply === null) {
    error_log('[ds1-holocron] ' . $err);
    respond(502, ['error' => 'The Holocron is silent right now. Try again in a moment.']);
}

respond(200, ['reply' => $reply, 'provider' => $provider]);
