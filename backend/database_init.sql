/*******************************************************************************
 * ARCHIVO: database_init.sql                                                  *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Script de inicialización estructural de la base de datos MySQL.             *
 * Construye la arquitectura relacional del sistema desde cero, incluyendo     *
 * tablas, claves foráneas, índices de optimización de consultas y la          *
 * configuración semilla para el arranque del sistema.                         *
 *******************************************************************************/


-- =============================================================================
-- CONFIGURACIÓN GLOBAL DEL ENTORNO
-- =============================================================================

-- Fuerza el uso de codificación UTF-8 moderna para soportar cualquier carácter
SET NAMES utf8mb4;

-- Desactiva temporalmente las comprobaciones de integridad referencial
-- Permite la destrucción inicial de tablas sin bloqueos por dependencias
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- CREACIÓN DEL SCHEMA PRINCIPAL
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `cuda_executor_db`
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE `cuda_executor_db`;

-- ============================================================================
-- LIMPIEZA CONTROLADA DE TABLAS EXISTENTES
-- Mantiene orden inverso de jerarquía para evitar conflictos de claves
-- ============================================================================

DROP TABLE IF EXISTS `tasks`;
DROP TABLE IF EXISTS `files`;
DROP TABLE IF EXISTS `system_settings`;
DROP TABLE IF EXISTS `users`;

-- =============================================================================
-- TABLA: users
-- =============================================================================

CREATE TABLE `users` (
`id` int NOT NULL AUTO_INCREMENT,
`name` varchar(100) NOT NULL DEFAULT 'Usuario',
`email` varchar(255) NOT NULL,
`password_hash` varchar(255) NOT NULL,
`role` enum('normal','admin') NOT NULL DEFAULT 'normal',
`is_active` tinyint(1) DEFAULT '1',
`tokens` int NOT NULL DEFAULT '10',
`last_token_renewal` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
`created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
`reset_token` varchar(255) DEFAULT NULL,
`reset_token_expiry` datetime DEFAULT NULL,
`password_reset_requested` tinyint(1) DEFAULT '0',
`force_password_change` tinyint(1) DEFAULT '0',

PRIMARY KEY (`id`),
UNIQUE KEY `email` (`email`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- TABLA: files
-- =============================================================================

CREATE TABLE `files` (
`id` int NOT NULL AUTO_INCREMENT,
`user_id` int DEFAULT NULL,
`original_name` varchar(255) NOT NULL,
`stored_name` varchar(255) NOT NULL,
`size_bytes` bigint NOT NULL,
`is_global` tinyint(1) DEFAULT '0',
`created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,

PRIMARY KEY (`id`),
UNIQUE KEY `stored_name` (`stored_name`),

KEY `user_id` (`user_id`),
KEY `idx_is_global` (`is_global`),
KEY `idx_user_created` (`user_id`, `created_at`),

CONSTRAINT `files_ibfk_1`
FOREIGN KEY (`user_id`)
REFERENCES `users` (`id`)
ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- TABLA: tasks
-- =============================================================================

CREATE TABLE `tasks` (
`id` int NOT NULL AUTO_INCREMENT,
`user_id` int NOT NULL,
`status` enum('pending','processing','completed','failed','cancelled')
NOT NULL DEFAULT 'pending',
`file_path` varchar(255) NOT NULL,
`source_code` TEXT,
`stdout` text,
`stderr` text,
`created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
`updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,

PRIMARY KEY (`id`),

KEY `user_id` (`user_id`),
KEY `idx_status` (`status`),
KEY `idx_created_at` (`created_at`),
KEY `idx_user_created` (`user_id`, `created_at`),

CONSTRAINT `tasks_ibfk_1`
FOREIGN KEY (`user_id`)
REFERENCES `users` (`id`)
ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- TABLA: system_settings
-- =============================================================================

CREATE TABLE `system_settings` (
`setting_key` varchar(50) NOT NULL,
`setting_value` varchar(255) NOT NULL,
`updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,

PRIMARY KEY (`setting_key`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DATOS SEMILLA
-- Configuración mínima necesaria para arrancar la plataforma
-- ============================================================================

INSERT INTO `system_settings`
(`setting_key`, `setting_value`)
VALUES
('registration_enabled', 'true'),
('execution_timeout', '30000'),
('storage_quota_mb', '200'),
('worker_concurrency', '1'),
('queue_status', 'running'),
('token_expiration_hours', '8'),
('token_reset_time', '00:00'),
('token_reset_amount', '10');

-- ============================================================================
-- REACTIVAR PROTECCIÓN DE INTEGRIDAD REFERENCIAL
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 1;
