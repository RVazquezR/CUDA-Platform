/*******************************************************************************
 * ARCHIVO: file.controller.ts                                                 *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Controlador encargado de la gestión de archivos a nivel de peticiones HTTP. *
 * Administra la subida, listado, eliminación y descarga segura de recursos,   *
 * interactua con el servicio y valida permisos de acceso.                     *
 *******************************************************************************/

import type { Response } from 'express';                    // Tipo nativo de Express para las respuestas HTTP
import type { AuthRequest } from '../types/express.js';     // Interfaz extendida que contiene el payload del JWT
import { fileService } from '../services/file.service.js';  // Servicio con la lógica de negocio de archivos
import { storageUtil } from '../utils/storage.util.js';     // Util para la resolución de rutas de almacenamiento

export const fileController = {

    /*
     * Sube un archivo personal al almacenamiento del usuario
     * Valida autenticación, existencia del archivo y límites dinámicos
     * de cuota antes de delegar el procesamiento al servicio
     */
    async upload(req: AuthRequest, res: Response): Promise<void> {
        try {

            // ID del usuario autenticado extraído del JWT
            const userId = req.user?.userId;

            // Archivo inyectado
            const file = req.file;

            // Bloquea accesos no autenticados
            if (!userId) {
                res.status(401).json({ status: 'error', message: 'No autorizado' });
                return;
            }

            // Verifica que realmente se haya enviado un archivo
            if (!file) {
                res.status(400).json({ status: 'error', message: 'No se ha subido ningún archivo' });
                return;
            }

            // Delega el almacenamiento y validaciones al servicio
            const fileId = await fileService.uploadUserFile(userId, file);

            // Respuesta exitosa con metadatos para el frontend
            res.status(201).json({
                status: 'success',
                message: 'Archivo subido y procesado correctamente',
                data: { fileId, originalName: file.originalname, size: file.size }
            });

        } catch (error: any) {

            // Los errores de cuota se tratan con HTTP 413 (Payload Too Large)
            if (error.message && error.message.includes('Cuota excedida')) {
                res.status(413).json({ status: 'error', message: error.message });

            } else {

                // Error genérico de subida o procesamiento
                res.status(400).json({ status: 'error', message: error.message || 'Error al procesar el archivo.' });
            }
        }
    },


    /*
     * Recupera el listado completo de archivos privados del usuario
     * Devuelve únicamente los archivos pertenecientes al propietario
     * autenticado
     */
    async listMyFiles(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Usuario autenticado
            const userId = req.user?.userId;

            // Obtiene todos los archivos asociados al usuario
            const files = await fileService.getUserFiles(userId!);
            
            // Respuesta exitosa con el listado completo 
            res.status(200).json({ status: 'success', data: files });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Recupera el listado de archivos globales compartidos
     * Estos archivos son subidos por el profesor y son accesibles
     * para todos los usuarios autenticados
     */
    async listGlobalFiles(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Obtiene todos los recursos marcados como globales
            const files = await fileService.getGlobalFiles();

            // Respuesta exitosa con el listado
            res.status(200).json({ status: 'success', data: files });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Elimina un archivo privado de un usuario autenticado
     * Libera espacio físico y lógico dentro del almacenamiento del sistema
     * validando propiedad y existencia del recurso
     */
    async deleteMyFile(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Usuario autenticado propietario del recurso
            const userId = req.user?.userId;

            // Conversión segura del id del archivo
            const fileId = parseInt(req.params.fileId as string, 10);

            // Verifica que el identificador sea válido
            if (isNaN(fileId)) {
                res.status(400).json({ status: 'error', message: 'ID de archivo inválido' });
                return;
            }

            // Delega borrado físico y lógico al servicio
            await fileService.deleteUserFile(userId!, fileId);
            
            // Mensaje de éxito
            res.status(200).json({ status: 'success', message: 'Archivo eliminado correctamente (Espacio liberado)' });

        } catch (error: any) {

            // Archivo inexistente o fuera del alcance del usuario
            if (error.message.includes('no encontrado')) {
                res.status(404).json({ status: 'error', message: error.message });

            } else {

                // Error inesperado del servidor
                res.status(500).json({ status: 'error', message: error.message });
            }
        }
    },

    /*
     * Descarga archivo privado o global ocultando la ruta física del servidor
     * Implementa validación de permisos antes de exponer cualquier recurso 
     * almacenado en disco
     */
    async download(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Usuario autenticado actual
            const userId = req.user?.userId;

            // Conversión segura del id del archivo
            const fileId = parseInt(req.params.fileId as string, 10);

            // Verifica que el identificador sea válido
            if (isNaN(fileId)) {
                res.status(400).json({ status: 'error', message: 'ID de archivo inválido' });
                return;
            }

            // Recuperación de metadatos desde la base de datos
            const file = await fileService.getFileMetadata(fileId);

            // El archivo solicitado no existe
            if (!file) {
                res.status(404).json({ status: 'error', message: 'Archivo no encontrado' });
                return;
            }

            // Verifica si el archivo pertenece al usuario autenticado
            const isOwner = file.user_id === userId;

            // Verifica si el recurso es global
            const isGlobal = file.is_global === 1 || file.is_global === true;

            // Bloquea accesos no autorizados
            if (!isOwner && !isGlobal) {
                res.status(403).json({ status: 'error', message: 'No tienes permiso para descargar este archivo' });
                return;
            }

            // Construcción segura de la ruta física real
            const filePath = storageUtil.getFilePath(
                file.stored_name, 
                isGlobal ? undefined : file.user_id, 
                isGlobal
            );

            // Delega flujo de bytes binarios al controlador nativo de Express
            // Transforma el nombre del disco al nombre original para el usuario
            res.download(filePath, file.original_name, (err) => {

                // Intercepta caídas de red o pérdida del archivo a mitad de descarga
                if (err) {

                    // Previene colisiones evitando reescribir cabeceras ya despachadas
                    if (!res.headersSent) {
                        res.status(500).json({ status: 'error', message: 'Error al procesar la descarga física' });
                    }
                }
            });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    }
};