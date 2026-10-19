<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');

$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    http_response_code(503);
    echo json_encode(['error' => 'No se encontraron las dependencias. Ejecuta composer install dentro de api/.']);
    exit;
}
require $autoload;
$config = require __DIR__ . '/config.php';

Flight::set('flight.log_errors', true);
Flight::set('flight.handle_errors', true);

final class ApiException extends RuntimeException {
    public int $httpStatus;
    public function __construct(string $message, int $httpStatus = 400) {
        parent::__construct($message);
        $this->httpStatus = $httpStatus;
    }
}

function db(): PDO {
    static $pdo = null;
    global $config;
    if ($pdo instanceof PDO) return $pdo;
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_port'], $config['db_name']);
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    return $pdo;
}

function apiResponse(callable $handler): void {
    try {
        $body = $handler();
        $status = 200;
        if (is_array($body) && isset($body['_http_status'])) {
            $status = (int)$body['_http_status'];
            unset($body['_http_status']);
        }
        http_response_code($status);
        Flight::json($body);
    } catch (ApiException $e) {
        http_response_code($e->httpStatus);
        Flight::json(['error' => $e->getMessage()]);
    } catch (PDOException $e) {
        error_log('[practica05] DB error: ' . $e->getMessage());
        http_response_code(503);
        Flight::json(['error' => 'No fue posible consultar la base de datos. Revisa la conexión y el esquema SQL.']);
    } catch (Throwable $e) {
        error_log('[practica05] API error: ' . $e->getMessage());
        http_response_code(500);
        Flight::json(['error' => 'Ocurrió un error interno al procesar la solicitud.']);
    }
}

function jsonBody(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $body = json_decode($raw, true);
    if (!is_array($body)) throw new ApiException('El cuerpo debe ser un objeto JSON válido.');
    return $body;
}

function requiredNumber(array $data, string $key, float $min, float $max): float {
    if (!array_key_exists($key, $data) || !is_numeric($data[$key])) throw new ApiException("Falta el valor numérico '{$key}'.");
    $value = (float)$data[$key];
    if ($value < $min || $value > $max) throw new ApiException("El valor '{$key}' está fuera del rango permitido ({$min}–{$max}).");
    return $value;
}

function fetchSimulation(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare('SELECT s.*, e.nombre AS especie_nombre, e.nombre_cientifico FROM simulaciones s JOIN especies e ON e.id = s.especie_id WHERE s.id = :id');
    $stmt->execute(['id' => $id]);
    $row = $stmt->fetch();
    if (!$row) throw new ApiException('La simulación solicitada no existe.', 404);
    $row['parametros'] = $row['parametros'] ? json_decode((string)$row['parametros'], true) : [];
    $m = $pdo->prepare('SELECT dia, altura_u, biomasa_g, n_hojas, n_ramas, icr, progreso_pct AS growth_pct, estres_hidrico, estres_termico, estres_luminico, estres_nutricional, estres_co2, estres_total FROM mediciones WHERE simulacion_id = :id ORDER BY dia');
    $m->execute(['id' => $id]);
    $row['mediciones'] = $m->fetchAll();
    $d = $pdo->prepare('SELECT id, regla, severidad, mensaje, recomendacion, metrica, valor, umbral, created_at FROM decisiones WHERE simulacion_id = :id ORDER BY id');
    $d->execute(['id' => $id]);
    $row['decisiones'] = $d->fetchAll();
    $c = $pdo->prepare('SELECT luz_pct, agua_pct, temperatura_c, nutrientes_pct, co2_ppm, viento, tasa_crecimiento, capacidad_carga FROM condiciones_ambientales WHERE simulacion_id = :id LIMIT 1');
    $c->execute(['id' => $id]);
    $row['condiciones'] = $c->fetch() ?: null;
    return $row;
}

Flight::route('GET /api/health', function () {
    apiResponse(function () {
        db()->query('SELECT 1');
        return ['ok' => true, 'database' => 'connected', 'service' => 'FlightPHP REST API', 'version' => '1.0'];
    });
});

Flight::route('GET /api/especies', function () {
    apiResponse(function () {
        $pdo = db();
        $search = trim((string)($_GET['q'] ?? ''));
        if ($search !== '') {
            $stmt = $pdo->prepare('SELECT id, nombre, nombre_cientifico, categoria, tasa_base, capacidad_carga, altura_max_cm, biomasa_max_g, temp_min, temp_max, temp_opt, agua_opt, luz_opt, nutrientes_opt, co2_opt, dias_madurez, color_hex, descripcion FROM especies WHERE nombre LIKE :q OR nombre_cientifico LIKE :q ORDER BY nombre');
            $stmt->execute(['q' => '%' . $search . '%']);
        } else {
            $stmt = $pdo->query('SELECT id, nombre, nombre_cientifico, categoria, tasa_base, capacidad_carga, altura_max_cm, biomasa_max_g, temp_min, temp_max, temp_opt, agua_opt, luz_opt, nutrientes_opt, co2_opt, dias_madurez, color_hex, descripcion FROM especies WHERE activa = 1 ORDER BY nombre');
        }
        return ['data' => $stmt->fetchAll()];
    });
});

Flight::route('GET /api/simulaciones', function () {
    apiResponse(function () {
        $pdo = db();
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $speciesId = isset($_GET['especie_id']) ? (int)$_GET['especie_id'] : 0;
        $sql = 'SELECT s.id, s.nombre, s.notas, s.especie_id, e.nombre AS especie_nombre, s.modelo, s.escenario_label, s.dias_simulados, s.altura_final, s.biomasa_final, s.hojas_finales, s.ramas_finales, s.icr_final, s.estres_hidrico, s.estres_termico, s.estres_luminico, s.estres_nutricional, s.estres_co2, s.estres_total, s.dias_cosecha_estimados, s.estado, s.created_at FROM simulaciones s JOIN especies e ON e.id=s.especie_id';
        if ($speciesId > 0) {
            $stmt = $pdo->prepare($sql . ' WHERE s.especie_id = :sid ORDER BY s.created_at DESC, s.id DESC LIMIT ' . $limit);
            $stmt->execute(['sid' => $speciesId]);
        } else {
            $stmt = $pdo->query($sql . ' ORDER BY s.created_at DESC, s.id DESC LIMIT ' . $limit);
        }
        return ['data' => $stmt->fetchAll()];
    });
});

Flight::route('GET /api/simulaciones/@id/mediciones', function ($id) {
    apiResponse(function () use ($id) {
        $simId = filter_var($id, FILTER_VALIDATE_INT);
        if (!$simId || $simId < 1) throw new ApiException('ID de simulación no válido.');
        $pdo = db();
        $check = $pdo->prepare('SELECT id FROM simulaciones WHERE id = ?');
        $check->execute([$simId]);
        if (!$check->fetch()) throw new ApiException('La simulación no existe.', 404);
        $stmt = $pdo->prepare('SELECT dia, altura_u, biomasa_g, n_hojas, n_ramas, icr, progreso_pct AS growth_pct, estres_hidrico, estres_termico, estres_luminico, estres_nutricional, estres_co2, estres_total FROM mediciones WHERE simulacion_id = :id ORDER BY dia');
        $stmt->execute(['id' => $simId]);
        return ['data' => $stmt->fetchAll()];
    });
});

Flight::route('GET /api/simulaciones/@id', function ($id) {
    apiResponse(function () use ($id) {
        $simId = filter_var($id, FILTER_VALIDATE_INT);
        if (!$simId || $simId < 1) throw new ApiException('ID de simulación no válido.');
        return fetchSimulation(db(), $simId);
    });
});

Flight::route('POST /api/simulaciones', function () {
    apiResponse(function () {
        $input = jsonBody();
        $pdo = db();
        $name = trim((string)($input['name'] ?? ''));
        if ($name === '' || (function_exists('mb_strlen') ? mb_strlen($name) : strlen($name)) > 150) throw new ApiException('El nombre es obligatorio y debe tener como máximo 150 caracteres.');
        $speciesId = (int)($input['species_id'] ?? 0);
        if ($speciesId < 1) throw new ApiException('Selecciona una especie válida.');
        $model = (string)($input['model'] ?? 'logistico');
        if (!in_array($model, ['lineal','exponencial','logistico','gompertz'], true)) throw new ApiException('Modelo matemático no permitido.');
        $scenario = (string)($input['scenario_label'] ?? 'A');
        if (!in_array($scenario, ['A','B'], true)) $scenario = 'A';
        $configData = is_array($input['config'] ?? null) ? $input['config'] : [];
        $environment = is_array($configData['environment'] ?? null) ? $configData['environment'] : [];
        $days = (int)($input['summary']['dias_simulados'] ?? $configData['days'] ?? count($input['measurements'] ?? []) - 1);
        $days = max(1, min(365, $days));
        $summary = is_array($input['summary'] ?? null) ? $input['summary'] : [];
        $measurements = $input['measurements'] ?? [];
        if (!is_array($measurements) || count($measurements) < 1 || count($measurements) > 366) throw new ApiException('Incluye entre 1 y 366 mediciones diarias.');
        $speciesStmt = $pdo->prepare('SELECT id FROM especies WHERE id = :id AND activa = 1');
        $speciesStmt->execute(['id' => $speciesId]);
        if (!$speciesStmt->fetch()) throw new ApiException('La especie no existe o está inactiva.', 404);

        $last = $measurements[count($measurements)-1];
        $paramsJson = json_encode($configData, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $pdo->beginTransaction();
        try {
            // Cada corrida representa un ejemplar virtual identificable en la tabla plantas.
            $plantIdentifier = 'PHY-' . strtoupper(bin2hex(random_bytes(5)));
            $plantStmt = $pdo->prepare('INSERT INTO plantas (especie_id, identificador, alias, notas) VALUES (:especie,:identificador,:alias,:notas)');
            $plantStmt->execute(['especie'=>$speciesId,'identificador'=>$plantIdentifier,'alias'=>substr($name,0,150),'notas'=>'Ejemplar virtual creado al guardar una simulación.']);
            $plantId = (int)$pdo->lastInsertId();
            $stmt = $pdo->prepare('INSERT INTO simulaciones (nombre, notas, especie_id, planta_id, modelo, escenario_label, parametros, dias_simulados, altura_final, biomasa_final, hojas_finales, ramas_finales, icr_final, estres_hidrico, estres_termico, estres_luminico, estres_nutricional, estres_co2, estres_total, dias_cosecha_estimados, estado) VALUES (:nombre,:notas,:especie,:planta,:modelo,:escenario,:parametros,:dias,:altura,:biomasa,:hojas,:ramas,:icr,:agua,:termico,:luz,:nutri,:co2,:total,:cosecha,:estado)');
            $stmt->execute([
                'nombre'=>$name, 'notas'=>substr((string)($input['notes'] ?? ''),0,2000), 'especie'=>$speciesId, 'planta'=>$plantId, 'modelo'=>$model, 'escenario'=>$scenario,
                'parametros'=>$paramsJson, 'dias'=>$days, 'altura'=>(float)($summary['height_final'] ?? $last['height_u'] ?? 0),
                'biomasa'=>(float)($summary['biomass_final'] ?? $last['biomass_g'] ?? 0), 'hojas'=>(int)($summary['leaves_final'] ?? $last['n_hojas'] ?? 0),
                'ramas'=>(int)($summary['branches_final'] ?? $last['n_ramas'] ?? 0), 'icr'=>(float)($summary['icr_final'] ?? $last['icr'] ?? 0),
                'agua'=>(int)($last['stress_water'] ?? 0), 'termico'=>(int)($last['stress_thermal'] ?? 0), 'luz'=>(int)($last['stress_light'] ?? 0),
                'nutri'=>(int)($last['stress_nutrition'] ?? 0), 'co2'=>(int)($last['stress_co2'] ?? 0), 'total'=>(int)($summary['stress_total'] ?? $last['stress_total'] ?? 0),
                'cosecha'=>isset($summary['harvest_days']) ? (int)$summary['harvest_days'] : null, 'estado'=>'completada'
            ]);
            $simulationId = (int)$pdo->lastInsertId();
            $envStmt = $pdo->prepare('INSERT INTO condiciones_ambientales (simulacion_id,luz_pct,agua_pct,temperatura_c,nutrientes_pct,co2_ppm,viento,tasa_crecimiento,capacidad_carga) VALUES (:sim,:luz,:agua,:temp,:nutri,:co2,:viento,:tasa,:k)');
            $envStmt->execute(['sim'=>$simulationId,'luz'=>(float)($environment['light']??0),'agua'=>(float)($environment['water']??0),'temp'=>(float)($environment['temperature']??0),'nutri'=>(float)($environment['nutrients']??0),'co2'=>(float)($environment['co2']??420),'viento'=>(float)($environment['wind']??0),'tasa'=>(float)($configData['rate']??.1),'k'=>(float)($configData['K']??1000)]);
            $measurementStmt=$pdo->prepare('INSERT INTO mediciones (simulacion_id,dia,altura_u,biomasa_g,n_hojas,n_ramas,icr,progreso_pct,estres_hidrico,estres_termico,estres_luminico,estres_nutricional,estres_co2,estres_total) VALUES (:sim,:dia,:altura,:biomasa,:hojas,:ramas,:icr,:progreso,:agua,:termico,:luz,:nutri,:co2,:total)');
            foreach($measurements as $measurement){
                if(!is_array($measurement)) continue;
                $measurementStmt->execute(['sim'=>$simulationId,'dia'=>max(0,min(365,(int)($measurement['day']??0))),'altura'=>(float)($measurement['height_u']??0),'biomasa'=>(float)($measurement['biomass_g']??0),'hojas'=>(int)($measurement['n_hojas']??0),'ramas'=>(int)($measurement['n_ramas']??0),'icr'=>(float)($measurement['icr']??0),'progreso'=>(float)($measurement['growth_pct']??0),'agua'=>(int)($measurement['stress_water']??0),'termico'=>(int)($measurement['stress_thermal']??0),'luz'=>(int)($measurement['stress_light']??0),'nutri'=>(int)($measurement['stress_nutrition']??0),'co2'=>(int)($measurement['stress_co2']??0),'total'=>(int)($measurement['stress_total']??0)]);
            }
            $decisionStmt=$pdo->prepare('INSERT INTO decisiones (simulacion_id,regla,severidad,mensaje,recomendacion,metrica,valor,umbral) VALUES (:sim,:regla,:sev,:mensaje,:reco,:metrica,:valor,:umbral)');
            foreach(($input['decisions']??[]) as $decision){
                if(!is_array($decision)) continue;
                $decisionStmt->execute(['sim'=>$simulationId,'regla'=>substr((string)($decision['title']??'Regla'),0,150),'sev'=>in_array(($decision['severity']??''),['good','warning','alert'],true)?$decision['severity']:'good','mensaje'=>substr((string)($decision['message']??''),0,1000),'reco'=>substr((string)($decision['recommendation']??''),0,1000),'metrica'=>substr((string)($decision['metric']??''),0,80),'valor'=>isset($decision['value'])?(float)$decision['value']:null,'umbral'=>isset($decision['threshold'])?(float)$decision['threshold']:null]);
            }
            $pdo->commit();
        } catch(Throwable $e){$pdo->rollBack();throw $e;}
        return ['_http_status'=>201,'ok'=>true,'id'=>$simulationId,'message'=>'Simulación y mediciones guardadas.'];
    });
});

Flight::route('GET /api/decisiones', function () {
    apiResponse(function () {
        $pdo = db();
        $simulationId = isset($_GET['simulacion_id']) ? (int)$_GET['simulacion_id'] : 0;
        if ($simulationId > 0) {
            $stmt=$pdo->prepare('SELECT d.*,s.nombre AS simulacion_nombre FROM decisiones d JOIN simulaciones s ON s.id=d.simulacion_id WHERE d.simulacion_id=:id ORDER BY d.id DESC');$stmt->execute(['id'=>$simulationId]);
        } else {
            $stmt=$pdo->query('SELECT d.*,s.nombre AS simulacion_nombre FROM decisiones d JOIN simulaciones s ON s.id=d.simulacion_id ORDER BY d.id DESC LIMIT 100');
        }
        return ['data'=>$stmt->fetchAll()];
    });
});

Flight::route('POST /api/comparar', function () {
    apiResponse(function () {
        $input=jsonBody();$a=filter_var($input['simulacion_a']??null,FILTER_VALIDATE_INT);$b=filter_var($input['simulacion_b']??null,FILTER_VALIDATE_INT);
        if(!$a||!$b||$a===$b)throw new ApiException('Se requieren dos ID de simulación diferentes.');
        $pdo=db();$stmt=$pdo->prepare('SELECT s.id,s.nombre,e.nombre AS especie_nombre,s.modelo,s.biomasa_final,s.altura_final,s.dias_simulados,s.estres_total,s.dias_cosecha_estimados FROM simulaciones s JOIN especies e ON e.id=s.especie_id WHERE s.id IN (:a,:b)');$stmt->execute(['a'=>$a,'b'=>$b]);$rows=$stmt->fetchAll();if(count($rows)!==2)throw new ApiException('No se encontraron las dos simulaciones.',404);
        $ra=null;$rb=null;foreach($rows as $row){if((int)$row['id']===$a)$ra=$row;if((int)$row['id']===$b)$rb=$row;}
        $difference=(float)$ra['biomasa_final']-(float)$rb['biomasa_final'];$winner=$difference>=0?'A':'B';
        return ['a'=>$ra,'b'=>$rb,'ganador_biomasa'=>$winner,'diferencia_biomasa'=>round(abs($difference),3),'diferencia_porcentual'=>round(abs($difference)/max((float)$ra['biomasa_final'],(float)$rb['biomasa_final'],.01)*100,2),'nota'=>'El ganador es una comparación de resultados simulados; requiere validación experimental.'];
    });
});

Flight::route('GET /api/reportes', function () {
    apiResponse(function () {
        $pdo=db();
        $total=(int)$pdo->query('SELECT COUNT(*) FROM simulaciones')->fetchColumn();
        $top=$pdo->query('SELECT s.id,s.nombre,e.nombre AS especie_nombre,s.modelo,s.biomasa_final,s.altura_final,s.dias_simulados,s.estres_total,s.dias_cosecha_estimados,s.created_at FROM simulaciones s JOIN especies e ON e.id=s.especie_id ORDER BY s.biomasa_final DESC LIMIT 5')->fetchAll();
        $eff=$pdo->query('SELECT e.nombre, ROUND(AVG(s.biomasa_final / NULLIF(s.dias_simulados,0)),4) AS eficiencia, ROUND(MAX(s.biomasa_final),3) AS biomasa_final, COUNT(s.id) AS corridas FROM simulaciones s JOIN especies e ON e.id=s.especie_id GROUP BY e.id,e.nombre ORDER BY eficiencia DESC LIMIT 6')->fetchAll();
        $maturity=$pdo->query('SELECT AVG(dias_cosecha_estimados) FROM simulaciones WHERE dias_cosecha_estimados IS NOT NULL')->fetchColumn();
        return ['total_simulaciones'=>$total,'top_biomasa'=>$top,'eficiencia_especies'=>$eff,'madurez_promedio'=>$maturity===null?null:round((float)$maturity,2)];
    });
});

Flight::route('GET /api', function () {
    Flight::json(['service'=>'PHY TOLAB API','routes'=>['GET /api/health','GET /api/especies','GET /api/simulaciones','GET /api/simulaciones/@id','GET /api/simulaciones/@id/mediciones','POST /api/simulaciones','GET /api/decisiones','POST /api/comparar','GET /api/reportes']]);
});

Flight::start();
