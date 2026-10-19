# Práctica 05 — PHY TOLAB: Laboratorio bioinformático de cultivo

## 1. Descripción

Aplicación educativa que extiende el simulador vegetal anterior y conecta una escena 3D con una API REST en PHP/FlightPHP y una base de datos MySQL. Permite seleccionar una especie, cambiar variables ambientales y genéticas, comparar dos escenarios A/B, visualizar modelos de crecimiento y estrés, generar recomendaciones sencillas, guardar corridas y consultar reportes.

**Importante:** los modelos y los datos precargados son demostrativos. Las salidas no constituyen predicciones agronómicas validadas; para un uso real deben calibrarse con mediciones experimentales y revisarse con especialistas.

## 2. Estructura del proyecto

```text
practica-05-bioinformatica/
├── index.html
├── style.css
├── main.js
├── router.php                 # Router para el servidor PHP integrado
├── README.md
├── respuestas_classroom.md      # Respuestas del cuestionario en archivo separado
├── .gitignore
├── api/
│   ├── composer.json          # Dependencia flightphp/core
│   ├── config.php             # Configuración mediante variables de entorno
│   ├── index.php              # API REST y acceso PDO
│   ├── requests.http          # Peticiones de ejemplo para probar la API
│   └── .htaccess              # Rewrite opcional para Apache
├── database/
│   ├── schema.sql             # Esquema MySQL 8
│   └── seed.sql               # Especies y corridas sintéticas ya medidas
├── shaders/
│   ├── wind.vert              # Desplazamiento de vértices por viento
│   └── wind.frag              # Color/sombreado sencillo de las hojas
├── assets/                    # Reservado para recursos adicionales
└── captura.png                # Añadir una captura real después de ejecutar el visor
```

## 3. Requisitos previos

- PHP 8.1 o superior con extensiones `pdo_mysql`, `json` y `mbstring` (si `mbstring` no está instalada, el código puede ajustarse para usar `strlen`).
- Composer.
- MySQL 8.0+ o compatible.
- Navegador WebGL moderno y conexión a internet para descargar Three.js y Chart.js desde sus CDN.
- MySQL Workbench o un cliente de MySQL para ejecutar los scripts SQL.

## 4. Instalación de la base de datos

1. Abre MySQL Workbench y conéctate a tu servidor local.
2. Abre y ejecuta primero `database/schema.sql`.
3. Abre y ejecuta `database/seed.sql`.
4. Comprueba que `practica05_bioinformatica` contiene las tablas `especies`, `plantas`, `simulaciones`, `condiciones_ambientales`, `mediciones` y `decisiones`.
5. En la tabla `especies` deben aparecer seis especies; en `mediciones` se precargan puntos de ejemplo para tres corridas.

> **Aviso:** `schema.sql` elimina y vuelve a crear las tablas de esta base para facilitar una instalación limpia de la práctica. No lo ejecutes sobre datos que quieras conservar.

Los registros del `seed.sql` son **datos sintéticos de ejemplo**, no mediciones tomadas de plantas reales.

## 5. Instalar FlightPHP

Desde Git Bash, en la carpeta raíz del proyecto:

```bash
cd api
composer install
cd ..
```

Composer instalará FlightPHP en `api/vendor/`. Esa carpeta está excluida de Git; cada persona debe instalar las dependencias con Composer.

## 6. Configurar y ejecutar

En Git Bash, desde la carpeta raíz del proyecto, configura las credenciales de tu MySQL. Para una instalación local típica de XAMPP con usuario `root` sin contraseña, los valores siguientes suelen ser el punto de partida; ajústalos a tu equipo:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME=practica05_bioinformatica
export DB_USER=root
export DB_PASS=''
php -S 127.0.0.1:8000 router.php
```

Mantén abierta la terminal y visita `http://127.0.0.1:8000`.

Comprueba la API en otra terminal:

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/especies
curl http://127.0.0.1:8000/api/reportes
```

La primera respuesta debe indicar `"ok":true` y `"database":"connected"`. Si la aplicación muestra “Modo demostración local”, la interfaz está funcionando sin API, pero los registros se guardarán únicamente en `localStorage` de ese navegador. Para cumplir con la persistencia de la práctica, configura MySQL y confirma que el estado de la API sea conectado.

Si PHP no reconoce `pdo_mysql`, habilita esa extensión en el `php.ini` que esté usando la terminal. Para detener el servidor usa `Ctrl + C`.

## 7. Funcionalidades

- **Catálogo de especies desde MySQL:** maíz, frijol, tomate, *Arabidopsis thaliana*, girasol y lavanda.
- **Modelos matemáticos:** lineal, exponencial, logístico de Verhulst y Gompertz.
- **Parámetros:** luz, agua, temperatura, nutrientes, CO₂, intensidad del viento, tasa de crecimiento `r`, capacidad de carga `K` y horizonte temporal.
- **Escenarios A/B:** compara la misma especie bajo configuraciones de agua/temperatura diferentes y permite seleccionar modelos diferentes.
- **Visor Three.js:** los constructores procedurales distinguen las especies por su porte: maíz alto con hojas largas, panoja y mazorcas; frijol trepador con hojas trifoliadas, flores pequeñas y vainas; tomate ramificado con hojas compuestas, flores amarillas discretas, frutos rojos y sépalos; girasol con una cabeza floral terminal grande; lavanda como mata compacta de hojas estrechas y espigas violetas; y *Arabidopsis thaliana* como roseta basal baja con varios tallos florales finos, flores blancas de cuatro pétalos y silicuas. Incluye OrbitControls, raycasting, jerarquías y shader GLSL para mover las hojas. Las formas son esquemáticas y educativas, no modelos botánicos de precisión.
- **Indicadores:** día simulado, altura estimada, biomasa, número estimado de hojas y ramas, ICR, estrés compuesto y recomendación prioritaria.
- **Chart.js:** curvas de biomasa en progreso, comparación por escenarios, estrés y eficiencia aproximada por especie.
- **Motor de decisiones:** reglas educativas para riego, temperatura, luz, nutrición y madurez estimada.
- **Persistencia MySQL:** guarda simulaciones, condiciones ambientales, mediciones diarias y decisiones bajo una transacción.
- **Historial/reportes:** historial de corridas, top 5 por biomasa, eficiencia relativa por especie y madurez media.
- **Exportación:** CSV con mediciones A/B y función de imprimir/guardar en PDF mediante el diálogo del navegador.

## 8. API REST (FlightPHP)

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api/health` | Comprobar que API y conexión MySQL respondan. |
| `GET` | `/api/especies` | Consultar el catálogo. Acepta `?q=maiz` para filtrar por nombre. |
| `GET` | `/api/simulaciones?limit=50` | Consultar el historial resumido, con un límite controlado. |
| `GET` | `/api/simulaciones/{id}` | Consultar una simulación, mediciones, condiciones y decisiones. |
| `GET` | `/api/simulaciones/{id}/mediciones` | Consultar la serie temporal de una corrida. |
| `POST` | `/api/simulaciones` | Guardar resultados, condiciones, mediciones y decisiones. |
| `GET` | `/api/decisiones?simulacion_id=1` | Consultar recomendaciones persistidas. |
| `POST` | `/api/comparar` | Comparar dos simulaciones ya guardadas por sus ID. |
| `GET` | `/api/reportes` | Devolver top 5 de biomasa, eficiencia por especie y madurez media. |

Ejemplo de cuerpo para `POST /api/comparar`:

```json
{
  "simulacion_a": 1,
  "simulacion_b": 2
}
```

El cliente usa `fetch`/`async-await`. FlightPHP procesa las rutas, PDO realiza consultas preparadas y MySQL devuelve filas que se serializan como JSON.

## 9. Modelos matemáticos y supuestos

- **Lineal:** `N(t) = a · t + b`. La implementación utiliza una progresión lineal limitada entre un valor inicial pequeño y una fracción máxima de la capacidad.
- **Exponencial:** `N(t) = N₀ · e^(r·t)`. Representa crecimiento rápido en la etapa inicial; se limita para que la representación visual no exceda el rango del modelo.
- **Logístico de Verhulst:** `N(t) = K / (1 + ((K/N₀)-1) · e^(-r·t))`. La capacidad de carga `K` limita el crecimiento.
- **Gompertz:** `N(t) = K · exp(-exp(-r·(t-t₀)))`. `t₀` controla el desplazamiento de la curva y representa un punto próximo a la etapa de crecimiento más rápido.

Para el motor educativo, los valores calculados se convierten a un porcentaje de desarrollo (`progreso_pct`); ese porcentaje actualiza la escala de los objetos 3D. El tallo/ramas escalan sobre su eje longitudinal y el movimiento del viento se combina con rotación de grupos y desplazamiento de vértices GLSL.

## 10. Indicadores de estrés y decisiones

Cada estrés compara el valor del ambiente con el óptimo de la especie y se limita a `0–100`. El índice compuesto utiliza pesos: hídrico 32 %, térmico 28 %, lumínico 18 %, nutricional 14 % y CO₂ 8 %. Una desviación mayor reduce la tasa efectiva de crecimiento.

Ejemplos de reglas del motor:

- Si agua `< óptimo hídrico − 18`, emite alerta y recomienda revisar/aumentar el riego.
- Si temperatura se desvía más de 6 °C del óptimo, recomienda reducir el estrés térmico mediante ventilación o sombra.
- Si luz `< óptimo lumínico − 20`, recomienda revisar sombreado/iluminación.
- Si el estrés compuesto es `≥ 55`, genera una alerta general.
- Se considera madurez simulada al superar un umbral de desarrollo de 92 %. La recomendación es una señal para inspección, no una instrucción de cosecha automática.

## 11. Seguridad y límites

- Las consultas que reciben valores del usuario usan sentencias preparadas de PDO.
- Los modelos matemáticos se validan contra una lista permitida; los parámetros numéricos y los ID se validan en el servidor.
- Los errores internos no devuelven mensajes de base de datos al cliente; se registra un mensaje en el log del servidor.
- Las credenciales se leen de variables de entorno; no subas contraseñas reales a GitHub.
- `api/vendor/` no se versiona. Usa el archivo `composer.json` para reproducir dependencias.
- En una implementación real también harían falta autenticación/autorización, limitación de peticiones, validación más estricta, registros de auditoría y HTTPS.

## 12. Captura y entrega

Después de ejecutar el proyecto en el navegador, usa `Win + Shift + S` y guarda una captura real de la pantalla principal como `captura.png` en esta carpeta. Puedes tomar capturas adicionales de la pestaña Historial y Reportes. No se incluye una imagen simulada como evidencia.

Antes de entregar comprueba `/api/health`, guarda al menos una corrida en MySQL, revisa que aparezca en Historial y que los reportes se actualicen. Sube a GitHub el proyecto junto con `database/schema.sql` y `database/seed.sql`.

---

# Respuestas sugeridas para Classroom

Estas respuestas son una base redactada en primera persona. Modifica especialmente la respuesta sobre la dificultad del proyecto para que describa tu experiencia real.

### 1. ¿Qué modelo ecológico o botánico representa tu simulador y por qué es relevante en bioinformática?

Mi simulador representa el desarrollo de un cultivo bajo diferentes condiciones ambientales. Incluye especies vegetales y cuatro modelos matemáticos: lineal, exponencial, logístico de Verhulst y Gompertz. Es relevante para la bioinformática porque combina datos biológicos estructurados con algoritmos de análisis y permite comparar hipótesis mediante resultados reproducibles. En este proyecto los datos y las ecuaciones son didácticos, no datos experimentales validados.

### 2. ¿Cómo diseñaste el esquema de la base de datos MySQL? Explica la función de cada tabla y las relaciones.

Diseñé seis tablas. `especies` contiene el nombre científico, óptimos ambientales y parámetros base; `plantas` identifica ejemplares virtuales de esa especie; `simulaciones` guarda cada corrida, el modelo, el ejemplar, el horizonte temporal y los resultados finales. `condiciones_ambientales` registra las variables ambientales y los parámetros `r` y `K` usados en la corrida. `mediciones` almacena los valores temporales por día, como altura, biomasa, hojas, ramas, ICR y estrés. `decisiones` conserva las reglas activadas y sus recomendaciones. Una especie puede tener muchas plantas, y cada planta puede asociarse a corridas; cada simulación tiene condiciones, mediciones y decisiones asociadas. Las claves foráneas mantienen la integridad referencial.

### 3. ¿Cómo implementaste la API REST con FlightPHP? Menciona al menos tres rutas y su propósito.

Usé FlightPHP para definir rutas HTTP que responden JSON. `GET /api/especies` devuelve el catálogo; `POST /api/simulaciones` valida y guarda una corrida, sus condiciones, mediciones y decisiones; `GET /api/simulaciones/{id}` devuelve el detalle y la serie temporal; y `GET /api/reportes` calcula los rankings agregados. También creé `/api/health`, `/api/decisiones`, `/api/simulaciones/{id}/mediciones` y `POST /api/comparar`.

### 4. ¿Cómo conectaste Three.js con MySQL a través de PHP?

El navegador no se conecta directamente a MySQL. El frontend llama a la API mediante `fetch` y `async/await`; FlightPHP recibe la ruta y valida la petición; PDO ejecuta una consulta preparada en MySQL; el backend serializa el resultado a JSON y lo devuelve al frontend. JavaScript utiliza esa respuesta para poblar el catálogo, actualizar las gráficas, mostrar el historial y consultar las recomendaciones. Para guardar, se envían la configuración y las mediciones como JSON a `POST /api/simulaciones`.

### 5. ¿Qué modelo matemático de crecimiento usaste y cómo lo tradujiste a código y a la escala visual de la planta?

Implementé cuatro alternativas seleccionables. El modelo lineal usa una progresión proporcional al tiempo; el exponencial usa una función exponencial; el logístico limita el crecimiento según la capacidad de carga `K`; y Gompertz produce una curva sigmoide con el desplazamiento `t₀`. La tasa `r` se modifica con un factor de calidad ambiental. El valor se transforma a porcentaje de desarrollo y ese porcentaje controla la escala longitudinal del tallo y de las ramas, y la aparición gradual de hojas y flores. El sistema limita la escala para evitar valores visuales extremos.

### 6. ¿Cómo calculaste los índices de estrés y cómo afectan al crecimiento simulado?

Para cada variable calculé la diferencia absoluta respecto al óptimo registrado para la especie y la normalicé a un índice de `0` a `100`. El estrés compuesto pondera agua, temperatura, luz, nutrientes y CO₂. A partir del estrés combinado calculo un factor de calidad ambiental que reduce la tasa efectiva de crecimiento. Es una aproximación pedagógica; una aplicación real necesitaría funciones de respuesta calibradas para cada cultivo.

### 7. ¿En qué consiste tu motor de decisiones? Da un ejemplo de regla, su umbral y la recomendación que emite.

El motor revisa las condiciones y los índices calculados para emitir recomendaciones. Por ejemplo, si el agua disponible es menor que el óptimo de la especie menos 18 puntos, genera una alerta de posible estrés hídrico y recomienda revisar la humedad y ajustar el riego. Si la temperatura se separa más de 6 °C del óptimo, recomienda evaluar ventilación o sombreado. También avisa cuando el estrés compuesto llega a 55/100 o cuando la madurez prevista queda fuera del horizonte analizado.

### 8. ¿Cómo implementaste la comparación A/B y qué métricas usaste para declarar un ganador?

Construí dos configuraciones que se ejecutan con la misma especie, pero pueden tener diferentes modelos, agua y temperatura. Calculo una curva completa para cada escenario y los dibujo en el mismo gráfico; además, las dos plantas se muestran lado a lado en Three.js. La regla demostrativa principal considera ganador al escenario con mayor biomasa final. También observo altura, estrés total, ICR y tiempo de madurez estimado. En un estudio real no declararía un ganador con biomasa solamente: necesitaría réplicas, incertidumbre y validación experimental.

### 9. ¿Qué gráficas generaste y para qué sirven en el análisis? (Chart.js, CSV, PDF).

Usé Chart.js para la curva temporal de biomasa en A y B, una gráfica de barras de los índices de estrés por variable y un gráfico de eficiencia aproximada por especie a partir del historial. El CSV descarga las mediciones diarias de ambos escenarios para analizarlas en una hoja de cálculo o en Python/R. La opción PDF utiliza la función de impresión del navegador para guardar la vista como PDF.

### 10. ¿Cómo evitaste SQL Injection y qué otras medidas de seguridad aplicaste en la API?

Usé sentencias preparadas de PDO para los valores recibidos, validé los ID y parámetros numéricos, y limité los modelos a una lista explícita de valores permitidos. También limité el número de resultados que puede solicitar el historial, usé transacciones al guardar una simulación completa, leí las credenciales de variables de entorno y evité exponer errores internos de la base de datos al frontend. Para un despliegue real añadiría autenticación, roles, HTTPS, rate limiting y un manejo de logs/auditoría más completo.

### 11. ¿Qué parte del proyecto fue la más difícil y cómo la resolviste?

Una de las partes más complejas fue mantener sincronizados los resultados numéricos y la representación 3D. Lo resolví usando una serie de mediciones por día: la misma serie alimenta el crecimiento visual, las gráficas, los KPIs y el guardado en la base de datos. También separé las responsabilidades entre frontend, motor matemático y API para que un problema en una capa fuera más fácil de localizar.

### 12. ¿Qué decisiones agronómicas o biológicas concretas puede apoyar tu simulador?

Puede ayudar a formular hipótesis preliminares sobre cuándo revisar el riego, qué condiciones de temperatura o luz se alejan del óptimo de una especie, qué configuración obtiene más biomasa simulada y en qué momento se aproxima al umbral matemático de madurez. No debe utilizarse para decidir una cosecha o una aplicación real sin observaciones, datos del cultivo y asesoramiento técnico.

### 13. Si lo llevaras a un sistema real de investigación, ¿qué agregarías?

Agregaría datos reales de sensores IoT para humedad del suelo, radiación, temperatura y CO₂, junto con calibración de los modelos a partir de experimentos replicados. También incorporaría series temporales de secuenciación genómica o metadatos de variedades para estudiar asociaciones entre genotipo y fenotipo. Después probaría modelos de machine learning para predecir biomasa y un controlador PID para automatizar el riego, manteniendo validación, trazabilidad y supervisión humana.

### 14. ¿Cómo escalarías la aplicación para manejar cientos de simulaciones y usuarios concurrentes?

Mantendría índices en las claves foráneas y campos usados para filtrar/ordenar; paginaría el historial; guardaría mediciones por intervalos temporales y en lotes en lugar de cada fotograma; usaría caché para el catálogo de especies y reportes que cambian poco; y movería simulaciones costosas a una cola de trabajos. Versionaría el esquema con migraciones, protegería la API con autenticación y límites de solicitudes, usaría conexiones de base de datos controladas y monitorizaría errores, latencia y consultas lentas.

