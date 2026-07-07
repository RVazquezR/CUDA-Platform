/*******************************************************************************
 * ARCHIVO: redis.config.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Gestiona la conexión con el servidor Redis en memoria.                      *
 * Redis es usado como motor subyacente, debido a su rapidez, para la cola de  *
 * trabajos pesados (BullMQ), donde residen los procesos CUDA.                 *
 *******************************************************************************/

import { Redis } from 'ioredis';                    // Librería oficial para Redis y BullMQ
import dotenv from 'dotenv';                        // Librería para cargar variables de entorno desde .env
import { logger } from '../utils/logger.util.js';   // Regisrar actividad del servidor en logs

// Se cargan las variables de entorno (.env)
dotenv.config();

/*
 * Objeto maestro de configuración de Redis
 * Centraliza las credenciales aquí para que BullMQ (Colas y Workers)
 * puedan instanciar sus propias conexiones aisladas sin bloqueos de red
 */
export const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,

    // Requisito obluigatorio para BullMQ:
    // BullMQ ejecuta scripts LUA atómicos dentro de Redis. Si la conexión falla,
    // ioredis intentaría reintentarlo, lo que podría duplicar tareas pesadas.
    // 'null' delega el manejo de errores directamente al motor de BullMQ.
    maxRetriesPerRequest: null
};

/*
 * Instancia única de conexión a Redis
 * Se usa solo para los test de salud en el arranque
 */
const redisConnection = new Redis(redisOptions);

/*
 * Función para garantizar que Redis está vivo antes de arrancar la API
 * Se invoca en index.ts durante el encendido del servidor
 */
export const testRedisConnection = async (): Promise<void> => {
    try {
        // Envía el comando PING nativo de Redis
        const response = await redisConnection.ping();
        
        if (response === 'PONG') {
            logger.info('[Redis] Conectado correctamente (Motor de Colas BullMQ listo).');
        }
    } catch (error) {
        logger.error('[Redis] Error Crítico: No se pudo conectar a Redis:', error);

        // Fuerza el cierre del servidor para evitar inconsistencias.
        process.exit(1); 
    }
};

// Exporta la conexión como default para usarlo en controladores y servicios
export default redisConnection;