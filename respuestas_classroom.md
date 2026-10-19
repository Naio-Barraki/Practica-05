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


