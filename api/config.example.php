<?php

/**
 * Copia questo file in `config.php` (NON committato) e inserisci la chiave.
 * Su Aruba: permessi 600 dopo l'upload (solo owner read/write).
 */
return [
    // https://console.groq.com/keys
    'GROQ_API_KEY' => 'gsk_REPLACE_ME',
    // llama-3.3-70b-versatile e' stato spento da Groq il 16/08/2026.
    // Se qui resta un modello ritirato, groq.php usa comunque gpt-oss-120b.
    'GROQ_MODEL'   => 'openai/gpt-oss-120b',

    // Opzionale: fallback automatico se Groq non risponde.
    // 'MISTRAL_API_KEY' => '',
    // 'MISTRAL_MODEL'   => 'mistral-small-2603',

    // Origin permessi (CORS). Le richieste dallo stesso host passano sempre.
    'ALLOWED_ORIGINS' => [
        'https://www.edoedoedo.it',
        'https://edoedoedo.it',
    ],
];
