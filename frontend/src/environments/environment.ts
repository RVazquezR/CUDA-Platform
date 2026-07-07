/*******************************************************************************
 * ARCHIVO: environment.ts                                                     *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Archivo de configuración del entorno. Define los parámetros globales que    *
 * utilizará el frontend para comunicarse con los servicios backend durante    *
 * la ejecución local de la aplicación.                                        *
 *******************************************************************************/

export const environment = {

    // Indica si la aplicación está ejecutándose en modo producción o desarrollo
    production: false,

    // URL base de la API REST del backend
    apiUrl: 'http://localhost:3000/api',

    // URL base del servidor WebSocket para comunicación en tiempo real
    wsUrl: 'http://localhost:3000' 
};