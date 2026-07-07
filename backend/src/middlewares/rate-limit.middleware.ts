/*******************************************************************************
 * ARCHIVO: rate-limit.middleware.ts                                           *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Implementa escudos de seguridad (Rate Limiting) a nivel de red.             *
 * Protege la infraestructura contra ataques de denegación de servicio (DoS)   *
 * y evita abusos al limitar la cantidad de peticiones concurrentes por IP.    *
 *******************************************************************************/

import rateLimit from 'express-rate-limit';     // Middleware para limitar peticiones repetidas a rutas Express

/*
 * Escudo global: Para la navegación estándar de la plataforma (login, consultas de datos, etc)
 * Límite generoso para no afectar la experiencia de uso normal
 */
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Ventana de tiempo configurada a 15 minutos en milisegundos
    max: 100,                 // Máximo de 100 peticiones por IP en esa ventana
    standardHeaders: true,    // Devuelve la información del límite en los headers 'RateLimit-*'
    legacyHeaders: false,     // Desactiva cabeceras obsoletas 'X-RateLimit-*' para ahorrar ancho de banda
    message: { 
        status: 'error', 
        message: 'Demasiadas peticiones desde esta IP. Por favor, inténtalo de nuevo en 15 minutos.' 
    }
});

/*
 * Escudo restrictivo: Específico para las rutas críticas que interactúan con el hardware (CUDA)
 * Evita que un script malicioso o un error sature la cola de BullMQ o la GPU física
 */
export const cudaLimiter = rateLimit({
    windowMs: 60 * 1000,      // Ventana de tiempo corta de 1 minuto
    max: 5,                   // Límite estricto de 5 ejecuciones por minuto por IP
    standardHeaders: true,
    legacyHeaders: false,     
    message: { 
        status: 'error', 
        message: 'Has superado el límite de ejecuciones en GPU. Por favor, espera un minuto para no saturar el servidor.' 
    }
});