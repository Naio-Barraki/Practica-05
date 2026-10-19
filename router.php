<?php
declare(strict_types=1);

// El servidor integrado de PHP llama este archivo para cada petición.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// Todas las rutas /api se resuelven con FlightPHP. Así no se expone config.php.
if ($path === '/api' || str_starts_with($path, '/api/')) {
    require __DIR__ . '/api/index.php';
    return true;
}

// Deja que el servidor integrado entregue directamente archivos estáticos reales.
$relative = ltrim(str_replace('\\', '/', $path), '/');
$requested = __DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
if ($path !== '/' && is_file($requested)) {
    return false;
}

// La raíz abre el visor; rutas no reconocidas devuelven 404.
if ($path === '/') {
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__ . '/index.html');
    return true;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo '404 - Recurso no encontrado';
return true;
