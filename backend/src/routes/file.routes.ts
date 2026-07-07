/*******************************************************************************
 * ARCHIVO: file.routes.ts                                                     *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Define las rutas relacionadas con la gestión del almacenamiento de archivos *
 * de usuario y archivos globales.                                             *
 * Permite subir, listar, descargar y eliminar archivos de forma segura.       *
 *******************************************************************************/

import { Router } from 'express';                                       // Router nativo de Express para agrupar endpoints
import { fileController } from '../controllers/file.controller.js';     // Controlador que contiene la lógica de archivos
import { authMiddleware } from '../middlewares/auth.middleware.js';     // Middleware de seguridad para verificar JWT y roles
import { uploadMiddleware } from '../middlewares/upload.middleware.js'; // Middleware encargado de procesar subida de archivos
import { fileService } from '../services/file.service.js';              // Servicio de acceso y consulta de archivos

// Instancia aislada del router de archivos
const router = Router();

/*
 * Todas las rutas requieren autenticación JWT válida
 * verifyToken garantiza que el usuario esté autenticado
 */

/*******************************************************************************
* SUBIDA DE ARCHIVOS
*******************************************************************************/

// POST /api/files/upload
// Sube un archivo personal al almacenamiento del usuario
// Primero verifica token, luego procesa archivo, luego va al controlador
router.post('/upload', authMiddleware.verifyToken, uploadMiddleware.single, fileController.upload);


/*******************************************************************************
* CONSULTA DE ARCHIVOS
*******************************************************************************/

// GET /api/files
// Recupera todos los archivos privados del usuario
router.get('/', authMiddleware.verifyToken, fileController.listMyFiles);

// GET /api/files/global
// Recupera los archivos globales compartidos
router.get('/global', authMiddleware.verifyToken, fileController.listGlobalFiles);


/*******************************************************************************
* ELIMINACIÓN DE ARCHIVOS
*******************************************************************************/

// DELETE /api/files/:fileId
// Elimina un archivo perteneciente al usuario
router.delete('/:fileId', authMiddleware.verifyToken, fileController.deleteMyFile);


/*******************************************************************************
* DESCARGA DE ARCHIVOS
*******************************************************************************/

// GET /api/files/download/:fileId
// Descarga un archivo accesible para el usuario tanto privado como global
router.get('/download/:fileId', authMiddleware.verifyToken, fileController.download);


// Exporta el router de archivos para integrarlo en Express
export default router;