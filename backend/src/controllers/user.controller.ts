/*******************************************************************************
 * ARCHIVO: user.controller.ts                                                 *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Controlador central para el área personal del alumno.                       *
 * Gestiona la recuperación del perfil, actualización segura del perfil,       *
 * consulta de saldo en tiempo real y extracción de estadísticas personales.   *
 *******************************************************************************/

import type { Response } from 'express';                        // Tipo nativo de Express para las respuestas HTTP
import type { AuthRequest } from '../types/express.js';         // Interfaz extendida que contiene el payload del JWT
import pool from '../config/db.config.js';                      // Pool de conexiones reutilizable hacia la base de datos MySQL
import type { RowDataPacket, ResultSetHeader } from 'mysql2';   // Tipos oficiales de mysql2 para tipado seguro SQL
import bcrypt from 'bcrypt';                                    // Librería para hashear y verificar contraseñas de forma segura

// Coste computacional del algoritmo de encriptación (Balance entre seguridad y rendimiento)
const SALT_ROUNDS = 10;

// Expresión regular  que fuerza el uso de contraseñas seguras
// Requiere: 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+[\]{};':"\\|,.<>/?-]).{8,}$/;

export const userController = {
    
    /*
     * Recupera exclusivamente la identidad del usuario autenticado
     * Devuelve información de perfil sin estadísticas ni datos sensibles
     */
    async getProfile(req: AuthRequest, res: Response): Promise<void> {
        try {

            // ID extraído desde el JWT
            const userId = req.user?.userId;

            // Consulta únicamente los datos públicos del perfil
            const [users] = await pool.query<RowDataPacket[]>(
                'SELECT id, name, email, role, tokens, last_token_renewal, created_at FROM users WHERE id = ?',
                [userId]
            );

            // El usuario no existe en la base de datos
            if (users.length === 0) {
                res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });
                return;
            }

            // Devuelve únicamente el perfil del usuario
            res.status(200).json({
                status: 'success',
                data: users[0]
            });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Recupera métricas avanzadas y telemetría personal del usuario
     * Incluye estadísticas de ejecución, almacenamiento usado y cuota dinámica 
     * configurada en el sistema
     */
    async getMetrics(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Usuario autenticado
            const userId = req.user?.userId;

            // Parte 1: Métricas de ejecución
            const [stats] = await pool.query<RowDataPacket[]>(
                'SELECT status, COUNT(*) as count FROM tasks WHERE user_id = ? GROUP BY status',
                [userId]
            );

            // Estructura inicial de estadísticas inicializada todo en 0
            const executionStats = {
                total: 0,
                completed: 0,
                failed: 0,
                cancelled: 0,
                pending_or_processing: 0
            };

            // Transformación del resultado SQL a un objeto
            stats.forEach((row) => {

                // Conversión explícita a número
                const count = Number(row.count);

                // Acumulador global de ejecuciones
                executionStats.total += count;

                // Tareas completadas exitosamente
                if (row.status === 'completed') executionStats.completed = count;

                // Tareas sin éxito
                else if (row.status === 'failed') executionStats.failed = count;

                // Tareas que han sido canceladas
                else if (row.status === 'cancelled') executionStats.cancelled = count;

                // Incluye tareas pendientes o en ejecución
                else executionStats.pending_or_processing += count;
            });

            // Parte 2: Métricas de almacenamiento
            // Cuenta archivos y calcula espacio ocupado total
            const [fileStats] = await pool.query<RowDataPacket[]>(
                'SELECT COUNT(*) as total_files, SUM(size_bytes) as total_bytes FROM files WHERE user_id = ?',
                [userId]
            );

            // Normaliza los resultados obtenidos
            const storageStats = {
                total_files: Number(fileStats[0]?.total_files) || 0,
                total_bytes: Number(fileStats[0]?.total_bytes) || 0
            };

            // Parte 3: Obtener la cuota de almacenamiento dinámica
            // Valor por defecto seguro
            let quotaMB = 200;

            try {

                // Consulta la configuración global del sistema
                const [settings] = await pool.query<RowDataPacket[]>(
                    "SELECT setting_value FROM system_settings WHERE setting_key = 'storage_quota_mb'"
                );

                // Si existe configuración personalizada se aplica
                if (settings.length > 0) {
                    quotaMB = parseInt(settings[0].setting_value, 10);
                }

            } catch (settingsError) {

                // Si falla esta consulta no debe bloquear
                console.error("[UserMetrics] No se pudo leer la cuota dinámica:", settingsError);
            }

            // Empaquetado final de telemetría y métricas
            res.status(200).json({
                status: 'success',
                data: {
                    executions: executionStats,
                    storage: storageStats,
                    quotaMB: quotaMB 
                }
            });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Permite al usuario modificar parcialmente su perfil personal
     * Solo admite cambios de nombre y contraseña aplicando validaciones
     * y bloqueo defensivos
     */
    async updateProfile(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Usuario autenticado
            const userId = req.user?.userId;

            // Extrae todo lo que viene en el body
            const { name, password, email, role, tokens, ...otrosCampos } = req.body;

            // El correo únicamente puede modificarlo un administrador
            if (email) {
                res.status(403).json({ status: 'error', message: 'No se puede cambiar el correo, contacta con el administrador.' });
                return;
            }

            // Impide cualquier intento de elevar privilegios o modificar tokens
            if (role || tokens !== undefined || Object.keys(otrosCampos).length > 0) {
                res.status(403).json({ status: 'error', message: 'Intento de modificación de campos no permitidos detectado.' });
                return;
            }

            // Evita consultas vacías innecesarias
            if (!name && !password) {
                res.status(400).json({ status: 'error', message: 'No se han proporcionado datos para actualizar' });
                return;
            }

            // Construcción dinámica de la consulta a la base de datos
            let query = 'UPDATE users SET ';
            const queryParams: any[] = [];

            // Actualización del nombre (opcional)
            if (name) {
                query += 'name = ?, ';
                queryParams.push(name);
            }

            // Actualización de la contraseña (opcional)
            if (password) {
                
                // Validación de la seguridad de la contraseña
                if (!PASSWORD_REGEX.test(password)) {
                    res.status(400).json({ 
                        status: 'error', 
                        message: 'La nueva contraseña debe tener al menos 8 caracteres, incluir una mayúscula, una minúscula, un número y un carácter especial.' 
                    });
                    return;
                }

                // Hash seguro con bcrypt
                const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

                // Inserta el hash en la consulta
                query += 'password_hash = ?, ';
                queryParams.push(passwordHash);
            }

            // Elimina la última coma sobrante y añade el WHERE
            query = query.slice(0, -2) + ' WHERE id = ?';

            // Añade el id del usuario como parámetro final
            queryParams.push(userId);

            // Ejecución de la actualización
            const [result] = await pool.query<ResultSetHeader>(query, queryParams);

            // Si ninguna fila afectada es porque el usuario es inexistente
            if (result.affectedRows === 0) {
                res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });
                return;
            }

            // Confirmación de la actualización
            res.status(200).json({ 
                status: 'success', 
                message: 'Perfil actualizado correctamente. Los cambios se reflejarán en tu próximo inicio de sesión.' 
            });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Recupera exclusivamente el saldo actual de tokens del usuario
     * Endpoint muy ligero para refrescos rápidos del IDE
     */
    async getTokens(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Usuario autenticado
            const userId = req.user?.userId;

            // Recupera exclusivamente la columna requerida
            const [users] = await pool.query<RowDataPacket[]>(
                'SELECT tokens FROM users WHERE id = ?',
                [userId]
            );

            // El usuario no existe
            if (users.length === 0) {
                res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });
                return;
            }

            // Devuelve únicamente valor actual
            res.status(200).json({
                status: 'success',
                data: {
                    tokens: users[0].tokens
                }
            });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    }
};