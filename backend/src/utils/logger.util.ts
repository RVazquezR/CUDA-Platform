/*******************************************************************************
 * ARCHIVO: logger.util.ts                                                     *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Sistema de registro de eventos basado en Winston.                           *
 * Configura la librería Winston para guardar historiales de actividad         *
 * en la consola y en archivos rotativos diarios, separando los errores        *
 * del flujo de información general.                                           *
 *******************************************************************************/

import winston from 'winston';                              // Librería principal para el registro estructurado de eventos
import DailyRotateFile from 'winston-daily-rotate-file';    // Permite rotar automáticamente archivos de logs por fecha

// Extrae herramientas de formateo para construir la estructura visual
const { combine, timestamp, printf, colorize } = winston.format;

/*
 * Define la plantilla visual que tendrá cada línea en los archivos de log
 * Estructura estándar: [FECHA Y HORA] NIVEL: Mensaje del evento
 */
const myFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
});

/*
 * Instancia principal del sistema de logs
 * Centraliza toda la salida del backend
 */
export const logger = winston.createLogger({
    
    // Nivel mínimo que será registrado
    // info incluye: info, warn y error
    level: 'info',

    // Combina la marca de tiempo estándar con plantilla
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        myFormat
    ),

    // Destinos físicos donde se almacenarán los logs
    transports: [
        
        /***********************************************************************
         * REGISTRO HISTÓRICO GLOBAL
         **********************************************************************/

        // Guarda todos los eventos en un archivo rotativo
        // Comprime los archivos antiguos para ahorrar espacio en el servidor
        new DailyRotateFile({

            // Carpeta donde se almacenarán los logs
            dirname: 'logs',

            // Nombre del archivo generado diariamente
            filename: 'application-%DATE%.log',

            // Formato de fecha incrustado en el nombre
            datePattern: 'YYYY-MM-DD',

             // Comprime automáticamente logs antiguos en .gz
            zippedArchive: true,

            // Tamaño máximo permitido antes de rotar
            maxSize: '20m',

            // Conserva logs durante 14 días
            maxFiles: '14d'
        }),

        /***********************************************************************
         * REGISTRO AISLADO DE ERRORES
         **********************************************************************/

        // Guarda únicamente errores críticos en un archivo separado
        new DailyRotateFile({
            dirname: 'logs',
            filename: 'error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',

            // Solo registra eventos nivel error
            level: 'error',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        })
    ]
});

/*
 * Si el servidor no se está ejecutando en un entorno de producción
 * se imprimen en la terminal logs y con colores
 */
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: combine(

            // Colorea automáticamente según el nivel
            colorize(),

            // Timestamp más corto
            timestamp({ format: 'HH:mm:ss' }),

            // Reutiliza el formato visual de la plantilla
            myFormat
        )
    }));
}