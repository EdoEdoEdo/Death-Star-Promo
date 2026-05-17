<?php

/**
 * Copia questo file in `config.php` (NON committato) e inserisci la tua chiave.
 * Su Aruba: imposta i permessi a 600 dopo l'upload (solo owner read/write).
 */
return [
    'GROQ_API_KEY' => 'gsk_REPLACE_ME',
    'GROQ_MODEL'   => 'llama-3.3-70b-versatile',
    // Lista di Origin permessi (CORS). Lascia [] per accettare solo same-origin.
    'ALLOWED_ORIGINS' => [
        'https://www.edoedoedo.it',
        'https://edoedoedo.it',
    ],
];
