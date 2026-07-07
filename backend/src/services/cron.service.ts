/*******************************************************************************
 * ARCHIVO: cron.service.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Servicio orquestador de tareas programadas.                                 *
 * Encargado de la renovación automática de tokens para los alumnos, y         *
 * permite reconfiguración en caliente sin reiniciar la API.                   *
 *******************************************************************************/

import cron from 'node-cron';                                   // Librería para programar tareas mediante expresiones cron
import pool from '../config/db.config.js';                      // Pool de conexiones reutilizable hacia la base de datos
import { logger } from '../utils/logger.util.js';               // Registrar actividad del servidor en logs
import type { ResultSetHeader, RowDataPacket } from 'mysql2';   // Tipos de mysql2 para tipar resultados y filas de consultas SQL


// Guarda la referencia del cron activo para poder detenerlo o reprogramarlo
let activeCronJob: cron.ScheduledTask | null = null;

export const cronService = {
    /*
     * Inicializa el motor de tareas programadas durante el arranque del 
     * servidor Node.js
     * Recupera la configuración almacenada en base de datos o aplica valores 
     * seguros por defecto
     */
    async startJobs(): Promise<void> {
        // Hora por defecto para renovar tokens
        let resetTime = '00:00';
        // Cantidad de tokens por defecto
        let resetAmount = 10;
        
        try {
            // Recupera la configuración dinámica desde la base de datos
            const [settings] = await pool.query<RowDataPacket[]>(
                "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('token_reset_time', 'token_reset_amount')"
            );

            // Asigna los valores obtenidos a las variables locales
            settings.forEach(s => {
                if (s.setting_key === 'token_reset_time') resetTime = s.setting_value;
                if (s.setting_key === 'token_reset_amount') resetAmount = parseInt(s.setting_value, 10);
            });

        } catch (e) {

            // Usa valores por defecto si falla la lectura de configuración
            logger.warn('[Cron] No se pudo leer la configuración, usando defaults.');
        }

        // Programa el trabajo automático con los valores obtenidos
        this.scheduleJob(resetTime, resetAmount);
    },

    /*
     * Configura y reprograma dinámicamente la renovación automática de tokens
     * Se invoca en el arranque y cada vez que el Admin cambia los ajustes 
     * desde el panel de control
     */
    scheduleJob(time: string, amount: number) {
        // Detiene el cron anterior si ya existe uno activo
        if (activeCronJob) {
            activeCronJob.stop();
        }

        // Convierte la hora (HH:mm) a formato Cron (Minuto Hora * * *)
        const [hour, minute] = time.split(':');
        const cronExpression = `${minute} ${hour} * * *`;

        // Crea y registra el nuevo trabajo programado
        activeCronJob = cron.schedule(cronExpression, async () => {

            // Informa del inicio del mantenimiento automático
            logger.info(`[Cron] Ejecutando mantenimiento nocturno: Renovación a ${amount} Tokens...`);
            try {

                // Renueva los tokens de todos los usuarios normales
                const [result] = await pool.query<ResultSetHeader>(
                    `UPDATE users SET tokens = ?, last_token_renewal = CURRENT_TIMESTAMP WHERE role = 'normal'`,
                    [amount]
                );

                // Registra cuántos usuarios fueron actualizados
                logger.info(`[Cron] Renovación completada. Usuarios actualizados: ${result.affectedRows}`);

            } catch (error) {

                // Registra errores críticos ocurridos durante la tarea automática
                logger.error('[Cron] Error crítico durante la renovación de tokens:', error);
            }
        });

        // Informa de la la correcta programación activa del cron
        logger.info(`[Cron] Renovación de tokens programada dinámicamente a las ${time} (${amount} tokens).`);
    }
};