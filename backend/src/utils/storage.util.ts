/*******************************************************************************
 * ARCHIVO: storage.util.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Utilidad central para la gestión del sistema de almacenamiento.             *
 * Se encarga de crear, organizar y resolver las rutas reales donde            *
 * se almacenan los archivos del sistema y de los usuarios.                    *
 *******************************************************************************/

import fs from 'fs/promises';                       // API de promesas nativa para interactuar asíncronamente con el sistema de archivos
import path from 'path';                            // Módulo para manejar y normalizar rutas de archivos
import { logger } from '../utils/logger.util.js';   // Registrar actividad del servidor en logs

export const storageUtil = {
    
    // Carpeta raíz donde se almacenarán todos los archivos
    BASE_STORAGE_PATH: path.join(process.cwd(), 'storage'),

    // Carpeta dedicada a archivos privados de usuarios
    USERS_STORAGE_PATH: path.join(process.cwd(), 'storage', 'users'),

    // Carpeta dedicada a archivos globales compartidos
    GLOBAL_STORAGE_PATH: path.join(process.cwd(), 'storage', 'global'),

    /*
     * Inicializa la estructura física de almacenamiento
     * Crea automáticamente las carpetas necesarias si no existen
     */
    async initStorage(): Promise<void> {
        try {
            
            // recursive: true crea también carpetas padre automáticamente
            await fs.mkdir(this.USERS_STORAGE_PATH, { recursive: true });

            // Garantiza existencia del almacenamiento global
            await fs.mkdir(this.GLOBAL_STORAGE_PATH, { recursive: true });

            logger.info('[Storage] Estructura de directorios verificada/creada correctamente.');

        } catch (error) {

            logger.error('[Storage] Error crítico creando la estructura de directorios:', error);
            
            // Si falla el almacenamiento el servidor no debe arrancar
            process.exit(1);
        }
    },

    
    /*
     * Construye y devuelve la ruta física absoluta de un archivo almacenado
     * Resuelve tanto archivos globales como privados de usuario
     */
    getFilePath(storedName: string, userId?: number, isGlobal: boolean = false): string {

        // Si es un archivo global se busca en la carpeta global
        if (isGlobal) {
            return path.join(this.GLOBAL_STORAGE_PATH, storedName);
        }
        
        // Los archivos privados requieren un userId obligatorio
        if (!userId) {
            throw new Error("Se requiere un userId para archivos que no son globales");
        }

        // Cada usuario tiene su propia subcarpeta
        // ej. storage/users/2/
        return path.join(this.USERS_STORAGE_PATH, userId.toString(), storedName);
    }
};