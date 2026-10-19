-- PHY TOLAB / Práctica 05
-- MySQL 8.0+. Importar este archivo antes de seed.sql.
CREATE DATABASE IF NOT EXISTS practica05_bioinformatica
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE practica05_bioinformatica;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS decisiones;
DROP TABLE IF EXISTS mediciones;
DROP TABLE IF EXISTS condiciones_ambientales;
DROP TABLE IF EXISTS simulaciones;
DROP TABLE IF EXISTS plantas;
DROP TABLE IF EXISTS especies;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE especies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  nombre_cientifico VARCHAR(150) NOT NULL,
  categoria VARCHAR(60) NOT NULL DEFAULT 'General',
  tasa_base DECIMAL(6,4) NOT NULL DEFAULT 0.1000,
  capacidad_carga DECIMAL(10,2) NOT NULL DEFAULT 1000,
  altura_max_cm DECIMAL(8,2) NOT NULL DEFAULT 100,
  biomasa_max_g DECIMAL(10,3) NOT NULL DEFAULT 100,
  temp_min DECIMAL(5,2) NOT NULL DEFAULT 15,
  temp_max DECIMAL(5,2) NOT NULL DEFAULT 32,
  temp_opt DECIMAL(5,2) NOT NULL DEFAULT 24,
  agua_opt DECIMAL(5,2) NOT NULL DEFAULT 70,
  luz_opt DECIMAL(5,2) NOT NULL DEFAULT 70,
  nutrientes_opt DECIMAL(5,2) NOT NULL DEFAULT 65,
  co2_opt DECIMAL(7,2) NOT NULL DEFAULT 420,
  dias_madurez SMALLINT UNSIGNED NOT NULL DEFAULT 90,
  color_hex CHAR(7) NOT NULL DEFAULT '#6ba56a',
  descripcion VARCHAR(600) NOT NULL DEFAULT '',
  activa TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_especies_nombre_cientifico (nombre_cientifico),
  KEY idx_especies_activa_nombre (activa, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plantas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  especie_id INT UNSIGNED NOT NULL,
  identificador VARCHAR(60) NOT NULL,
  alias VARCHAR(150) NOT NULL,
  notas VARCHAR(600) NULL,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plantas_identificador (identificador),
  KEY idx_plantas_especie (especie_id, activa),
  CONSTRAINT fk_plantas_especie FOREIGN KEY (especie_id) REFERENCES especies(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE simulaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  notas VARCHAR(2000) NULL,
  especie_id INT UNSIGNED NOT NULL,
  planta_id BIGINT UNSIGNED NOT NULL,
  modelo ENUM('lineal','exponencial','logistico','gompertz') NOT NULL,
  escenario_label ENUM('A','B') NOT NULL DEFAULT 'A',
  parametros JSON NULL,
  dias_simulados SMALLINT UNSIGNED NOT NULL,
  altura_final DECIMAL(10,3) NOT NULL DEFAULT 0,
  biomasa_final DECIMAL(12,3) NOT NULL DEFAULT 0,
  hojas_finales INT UNSIGNED NOT NULL DEFAULT 0,
  ramas_finales INT UNSIGNED NOT NULL DEFAULT 0,
  icr_final DECIMAL(10,3) NOT NULL DEFAULT 0,
  estres_hidrico TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_termico TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_luminico TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_nutricional TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_co2 TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_total TINYINT UNSIGNED NOT NULL DEFAULT 0,
  dias_cosecha_estimados SMALLINT UNSIGNED NULL,
  estado ENUM('completada','borrador','fallida') NOT NULL DEFAULT 'completada',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_simulaciones_especie FOREIGN KEY (especie_id) REFERENCES especies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_simulaciones_planta FOREIGN KEY (planta_id) REFERENCES plantas(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  KEY idx_simulaciones_planta (planta_id),
  KEY idx_simulaciones_especie_fecha (especie_id, created_at),
  KEY idx_simulaciones_biomasa (biomasa_final DESC),
  KEY idx_simulaciones_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE condiciones_ambientales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulacion_id BIGINT UNSIGNED NOT NULL,
  luz_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  agua_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  temperatura_c DECIMAL(5,2) NOT NULL DEFAULT 0,
  nutrientes_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  co2_ppm DECIMAL(8,2) NOT NULL DEFAULT 420,
  viento DECIMAL(5,3) NOT NULL DEFAULT 0,
  tasa_crecimiento DECIMAL(6,4) NOT NULL DEFAULT 0.1,
  capacidad_carga DECIMAL(10,2) NOT NULL DEFAULT 1000,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_condiciones_simulacion (simulacion_id),
  CONSTRAINT fk_condiciones_simulacion FOREIGN KEY (simulacion_id) REFERENCES simulaciones(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mediciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulacion_id BIGINT UNSIGNED NOT NULL,
  dia SMALLINT UNSIGNED NOT NULL,
  altura_u DECIMAL(10,3) NOT NULL DEFAULT 0,
  biomasa_g DECIMAL(12,3) NOT NULL DEFAULT 0,
  n_hojas SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  n_ramas SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  icr DECIMAL(10,3) NOT NULL DEFAULT 0,
  progreso_pct DECIMAL(6,2) NOT NULL DEFAULT 0,
  estres_hidrico TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_termico TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_luminico TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_nutricional TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_co2 TINYINT UNSIGNED NOT NULL DEFAULT 0,
  estres_total TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_medicion_dia (simulacion_id, dia),
  KEY idx_mediciones_dia (dia),
  CONSTRAINT fk_mediciones_simulacion FOREIGN KEY (simulacion_id) REFERENCES simulaciones(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE decisiones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulacion_id BIGINT UNSIGNED NOT NULL,
  regla VARCHAR(150) NOT NULL,
  severidad ENUM('good','warning','alert') NOT NULL DEFAULT 'good',
  mensaje VARCHAR(1000) NOT NULL,
  recomendacion VARCHAR(1000) NOT NULL,
  metrica VARCHAR(80) NULL,
  valor DECIMAL(12,3) NULL,
  umbral DECIMAL(12,3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_decisiones_simulacion (simulacion_id, created_at),
  KEY idx_decisiones_severidad (severidad),
  CONSTRAINT fk_decisiones_simulacion FOREIGN KEY (simulacion_id) REFERENCES simulaciones(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
