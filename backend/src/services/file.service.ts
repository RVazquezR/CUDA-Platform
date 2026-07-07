/*******************************************************************************
 * ARCHIVO: file.service.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Gestor del sistema de almacenamiento. Administra el movimiento              *
 * de archivos físicos entre la aduana temporal y las carpetas de usuario      *
 * o global, controlando de manera dinámica las cuotas de disco y limpiando    *
 * metadatos.                                                                  *
 *******************************************************************************/

import fs from 'fs/promises';                                   // API de promesas nativa para interactuar asíncronamente con el sistema de archivos
import path from 'path';                                        // Módulo para construir y normalizar rutas físicas del sistema
import { randomUUID } from 'crypto';                            // Generador de identificadores únicos universales
import pool from '../config/db.config.js';                      // Pool de conexiones reutilizable hacia la base de datos MySQL
import { storageUtil } from '../utils/storage.util.js';         // Utilidades centralizadas para resolver rutas de almacenamiento
import type { ResultSetHeader, RowDataPacket } from 'mysql2';   // Tipos de mysql2 para tipar resultados y filas de consultas SQL

export const fileService = {

    /*
     * Calcula la cantidad de megabytes que le quedan disponibles a un usuario
     * basándose en la configuración del administrador impuesta en la base de datos
     */
    async getAvailableQuota(userId: number): Promise<number> {

        // Cuota por defecto en MB por si la lectura en la base de datos falla
        let maxQuotaMB = 200;

        try {

            // Recupera la cuota dinámica desde la configuración
            const [settings] = await pool.query<RowDataPacket[]>(
                "SELECT setting_value FROM system_settings WHERE setting_key = 'storage_quota_mb'"
            );

            // Sustituye el valor por defecto si existe configuración válida
            if (settings.length > 0) {

                // Parsea el valor almacenado como string a un entero en base 10
                maxQuotaMB = parseInt(settings[0].setting_value, 10);
            }

        } catch (err) {

            // Usa el valor por defecto si falla la lectura de configuración
            console.error("Error leyendo cuota dinámica, usando 200MB por defecto", err);
        }

        // Convierte la cuota de MB a Bytes
        const maxQuotaBytes = maxQuotaMB * 1024 * 1024;

        // Suma el tamaño físico de todos los archivos personales del usuario
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT SUM(size_bytes) as total_used FROM files WHERE user_id = ?', 
            [userId]
        );

        // Convierte el resultado SQL a número válido
        const currentUsed = Number(rows[0].total_used) || 0;
        
        // Retorna los bytes libres garantizando que no devuelvavalor negativo
        return Math.max(0, maxQuotaBytes - currentUsed);
    },

    /*
     * Procesa un archivo entrante desde la aduana perteneciente a usuario
     * Verifica la cuota en tiempo real antes de moverlo y registra  en MySQL
     */
    async uploadUserFile(userId: number, file: Express.Multer.File): Promise<number> {
        try {
            
            // Comprueba el espacio libre disponible del usuario
            const availableQuota = await this.getAvailableQuota(userId);

            // Bloquea la subida si el archivo supera la cuota disponible
            if (file.size > availableQuota) {

                // Elimina el archivo temporal recibido
                await fs.unlink(file.path);
                throw new Error(`Cuota excedida. Te quedan ${(availableQuota / 1024 / 1024).toFixed(2)} MB libres y el archivo pesa ${(file.size / 1024 / 1024).toFixed(2)} MB.`);
            }

            /*******************************************************************
             * PREPARACIÓN DEL DESTINO FINAL
             ******************************************************************/

            // Extrae la extensión original del archivo
            const fileExtension = path.extname(file.originalname);

            // Genera un nombre interno único para evitar colisiones
            const storedName = `${randomUUID()}${fileExtension}`;

            // Construye la carpeta privada del usuario
            const userFolderPath = path.join(storageUtil.USERS_STORAGE_PATH, userId.toString());
            
            // Crea automáticamente la carpeta si aún no existe
            await fs.mkdir(userFolderPath, { recursive: true });

            // Construye la ruta física final del archivo
            const finalDestination = path.join(userFolderPath, storedName);

            /*******************************************************************
             * MOVIMIENTO DEL ARCHIVO
             ******************************************************************/

            // Mueve el archivo desde temp/ a users/{id}/
            await fs.rename(file.path, finalDestination);

            /*******************************************************************
             * REGISTRO EN BASE DE DATOS
             ******************************************************************/

            // Inserta los metadatos del archivo en MySQL
            const [result] = await pool.query<ResultSetHeader>(
                'INSERT INTO files (user_id, original_name, stored_name, size_bytes, is_global) VALUES (?, ?, ?, ?, ?)',
                [userId, file.originalname, storedName, file.size, false]
            );

            // Devuelve el ID generado para el archivo
            return result.insertId;

        } catch (error) {
            // Elimina restos temporales si hay fallo a mitad del proceso
            if (file.path) {
                try { await fs.unlink(file.path); } catch (e) {
                    // Ignora errores si el archivo ya había sido eliminado
                }
            }
            throw error;
        }
    },

    /*
     * Recupera todos los archivos privados de un usuario
     * Devuelve únicamente metadatos visibles para el frontend
     */
    async getUserFiles(userId: number): Promise<RowDataPacket[]> {
        
        // Oculta nombres internos almacenados físicamente por seguridad
        const [files] = await pool.query<RowDataPacket[]>(
            'SELECT id, original_name, size_bytes, created_at FROM files WHERE user_id = ? AND is_global = FALSE ORDER BY created_at DESC',
            [userId]
        );

        return files;
    },

    /*
     * Elimina un archivo privado perteneciente a un usuario
     * Borra tanto el archivo físico como su registro en base de datos
     * LLeva orden estricto evitando estads fantasma
     */
    async deleteUserFile(userId: number, fileId: number): Promise<void> {

        /***********************************************************************
        * VALIDACIÓN DE PROPIEDAD DEL ARCHIVO
        ***********************************************************************/

        // Recupera el nombre real interno del archivo en el disco
        const [files] = await pool.query<RowDataPacket[]>(
            'SELECT stored_name FROM files WHERE id = ? AND user_id = ? AND is_global = FALSE',
            [fileId, userId]
        );

        // Bloquea acceso si el archivo no pertenece al usuario
        if (files.length === 0) {
            throw new Error('Archivo no encontrado o no tienes permisos para eliminarlo');
        }

        // Obtiene el nombre interno almacenado
        const storedName = files[0].stored_name;

        // Construye la ruta física completa
        const filePath = storageUtil.getFilePath(storedName, userId, false);

        /***********************************************************************
        * VALIDACIÓN DE PROPIEDAD DEL ARCHIVO
        ***********************************************************************/
        try {

            // Borra el archivo físicamente del disco duro
            await fs.unlink(filePath);

        } catch (error: any) {

            // Ignora errores ENOENT, si el archivo no existe físicamente 
            // (borrado manual por error), permite borrado de la base de datos 
            // para no dejar registros fantasma
            if (error.code !== 'ENOENT') throw error;
            console.warn(`[FileService] El archivo físico ${filePath} no existía al intentar borrarlo.`);
        }

        /***********************************************************************
        * VALIDACIÓN DE PROPIEDAD DEL ARCHIVO
        ***********************************************************************/
        
        // Elimina definitivamente el registro de la base de datos
        await pool.query('DELETE FROM files WHERE id = ?', [fileId]);
    },

    
    /*
     * Retorna todos los archivos globales compartidos en el sistema
     * Estos archivos no consumen la cuota del usuario
     * Manipulación disponible para usuarios administradores
     */
    async getGlobalFiles(): Promise<RowDataPacket[]> {
        const [files] = await pool.query<RowDataPacket[]>(
            'SELECT id, original_name, size_bytes, created_at FROM files WHERE is_global = TRUE ORDER BY created_at DESC'
        );
        return files;
    },

    /*
     * Publica archivo proporcionado por el administrador para todos los alumnos
     * Se salta la validación de cuota y se almacena en el directorio global
     */
    async uploadGlobalFile(file: Express.Multer.File): Promise<number> {
        try {

            // Extrae la extensión original del archivo
            const fileExtension = path.extname(file.originalname);

            // Genera un identificador interno único
            const storedName = `${randomUUID()}${fileExtension}`;
            
            // Construye la ruta física final del archivo global
            const finalDestination = path.join(storageUtil.GLOBAL_STORAGE_PATH, storedName);

            // Mueve el archivo temporal al almacenamiento global definitivo
            await fs.rename(file.path, finalDestination);

            // Registra el archivo global en la base de datos
            const [result] = await pool.query<ResultSetHeader>(
                'INSERT INTO files (user_id, original_name, stored_name, size_bytes, is_global) VALUES (NULL, ?, ?, ?, TRUE)',
                [file.originalname, storedName, file.size]
            );

            return result.insertId;

        } catch (error) {

            // Limpia restos temporales si el proceso falla
            if (file.path) try { await fs.unlink(file.path); } catch (e) {}

            throw error;
        }
    },

    /*
     * Permite a un administrador eliminar un recurso compartido del sistema
     * Sigue el mismo patrón de seguridad que el borrado de usuario
     * Ejecutable únicamente por los administradores
     */
    async deleteGlobalFile(fileId: number): Promise<void> {
        
        // Recupera el nombre interno del archivo global
        const [files] = await pool.query<RowDataPacket[]>(
            'SELECT stored_name FROM files WHERE id = ? AND is_global = TRUE',
            [fileId]
        );

        // Verifica que el archivo exista
        if (files.length === 0) throw new Error('Archivo global no encontrado');

        // Construye la ruta física completa
        const filePath = storageUtil.getFilePath(files[0].stored_name, undefined, true);

        // Elimina primero el registro lógico de la base de datos
        await pool.query('DELETE FROM files WHERE id = ? AND is_global = TRUE', [fileId]);

        try { 

            // Elimina el archivo físicamente del disco
            await fs.unlink(filePath); 
            
        } catch (error: any) {

            // Ignora errores ENOENT, si el archivo no existe físicamente 
            // (borrado manual por error), permite borrado de la base de datos 
            // para no dejar registros fantasma
            if (error.code !== 'ENOENT') {
                console.error(`[FileService] Error físico al borrar el archivo global ${filePath}:`, error);
            }
        }
    },

    /*
     * Recupera todos los metadatos asociados a un archivo
     * Utilizado por el controlador para gestionar el sistema de descargas seguras
     */
    async getFileMetadata(fileId: number): Promise<RowDataPacket | null> {

        // Busca el archivo por su identificador único
        const [files] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM files WHERE id = ?',
            [fileId]
        );

        // Devuelve null si el archivo no existe
        return files.length > 0 ? files[0] : null;
    }
};