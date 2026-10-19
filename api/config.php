<?php
declare(strict_types=1);

/**
 * Configuración de conexión local. Las credenciales se reciben mediante
 * variables de entorno para evitar guardarlas en el repositorio.
 */
$getEnv = static function (string $key, string $default = ''): string {
    $value = getenv($key);
    return $value === false ? $default : $value;
};

return [
    'db_host' => $getEnv('DB_HOST', '127.0.0.1'),
    'db_port' => $getEnv('DB_PORT', '3306'),
    'db_name' => $getEnv('DB_NAME', 'practica05_bioinformatica'),
    'db_user' => $getEnv('DB_USER', 'root'),
    'db_pass' => $getEnv('DB_PASS', ''),
];
