/*******************************************************************************
 * ARCHIVO: db.config.ts                                                       *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Este archivo gestiona la conexión principal con la base de datos MySQL.     *
 * No usa conexión única (cuello de botella), se implementa un Pool de         *
 * Conexiones para manejar múltiples peticiones concurrentes de forma          *
 * eficiente y segura.                                                         *
 *******************************************************************************/

import mysql from 'mysql2/promise';                 // Cliente MySQL compatible con promesas, permite async/await
import dotenv from 'dotenv';                        // Librería para cargar variables de entorno desde .env
import { logger } from '../utils/logger.util.js';   // Registrar actividad del servidor en logs

// Se cargan las variables de entorno (.env)
dotenv.config();

// Pool de conexiones para manteer conexiones abiertas listas para usarse
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,

    // Configuración avanzada del Pool para alto rendimiento
    waitForConnections: true, // Si pool lleno, encola peticiones y no rechaza
    connectionLimit: 30,      // Máximo de conexiones físicas concurrentes
    maxIdle: 15,              // Máximo de conexiones inactivas esperando
    idleTimeout: 60000,       // Tiempo (ms) que una conexión puede estar inactiva antes de cerrarse para ahorrar RAM
    queueLimit: 100,          // Límite en la cola de peticiones en espera

    // Prevención de desconexiones fantasma por inactividad de red
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Función para comprobar que la conexión funciona al arrancar el servidor
export const testDbConnection = async (): Promise<void> => {
    try {
        // Intenta extraer una conexión física real del pool
        const connection = await pool.getConnection();

        logger.info('[MySQL] Conexión establecida correctamente. Pool preparado.');
        // Libera la conexión para que vuelva al pool evitando fugas de memoria
        connection.release();
    } catch (error) {
        logger.error('[MySQL] Error Crítico conectando a la base de datos:', error);

        // Mata el proceso de Node.js (Código salida 1 = Error fatal) y evita inconsistencias. 
        // Gestores como Docker no intenten servir la aplicación
        process.exit(1);
    }
};

// Exporta el pool como default para usarlo en controladores y servicios
export default pool;