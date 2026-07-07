/*******************************************************************************
 * ARCHIVO: admin.routes.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Define las rutas de los administradores  protegidas de la plataforma.       *
 * Permite gestionar usuarios, cola de ejecución, archivos globales,           *
 * métricas del sistema y configuraciones dinámicas del sistema.               *
 *******************************************************************************/

import { Router } from 'express';                                       // Router nativo de Express para agrupar endpoints
import { adminController } from '../controllers/admin.controller.js';   // Controlador que contiene la lógica de administración
import { authMiddleware } from '../middlewares/auth.middleware.js';     // Middleware de seguridad para verificar JWT y roles
import { uploadMiddleware } from '../middlewares/upload.middleware.js'; // Middleware encargado de procesar subida de archivos

// Instancia aislada del router administrativo
const router = Router();

/*
 * Todas las rutas administrativas están doblemente protegidas:
 * 1. verifyToken: Confirma que la petición proviene de un usuario logueado
 * 2. isAdmin: Confirma que ese usuario tiene el rol de 'admin'
 */

/*******************************************************************************
* GESTIÓN DE USUARIOS
*******************************************************************************/

// PUT /api/admin/students/:studentId/tokens
// Modifica el saldo de tokens de un alumno específico
// Permite sumar, restar o establecer un valor fijo desde el panel
router.put('/students/:studentId/tokens', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.updateTokens);

// GET /api/admin/users
// Recupera el listado completo de usuarios registrados en el sistema
router.get('/users', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.getAllUsers);

// PUT /api/admin/users/:userId
// Actualiza los datos de un usuario existente
router.put('/users/:userId', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.updateUser);

// DELETE /api/admin/users/:userId
// Elimina permanentemente a un usuario y todos sus datos físicos y lógicos asociados
router.delete('/users/:userId', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.deleteUser);

// DELETE /api/admin/users/purge/students
// Elimina todas las cuentas con rol 'normal'
router.delete('/users/purge/students', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.deleteAllStudents);

// PATCH /api/admin/users/:id/status
// Activa o suspende una cuenta de usuario
router.patch('/users/:id/status', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.toggleUserStatus);

// POST /api/admin/users/:userId/force-reset
// Genera contraseña temporal para un usuario y obliga después al cambio de contraseña
router.post('/users/:userId/force-reset', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.forcePasswordReset);


/*******************************************************************************
* GESTIÓN DE LA COLA DE TRABAJOS (BULLMQ)
*******************************************************************************/

// POST /api/admin/queue/pause
// Pausa el procesamiento de nuevos trabajos en la cola
// Los trabajos en ejecución sí finalizan, si están en cola esperan
router.post('/queue/pause', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.pauseQueue);

// POST /api/admin/queue/resume
// Reanuda el procesamiento normal de la cola
router.post('/queue/resume', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.resumeQueue);

// DELETE /api/admin/queue/clear
// Vacía la cola eliminando permanentemente todos los trabajos pendientes
router.delete('/queue/clear', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.clearQueue);


/*******************************************************************************
* GESTIÓN DE ARCHIVOS DEL SISTEMA
*******************************************************************************/

// POST /api/admin/files/upload
// Sube un recurso global disponible para todos los alumnos
router.post('/files/upload', authMiddleware.verifyToken, authMiddleware.isAdmin, uploadMiddleware.single, adminController.uploadGlobal);

// DELETE /api/admin/files/:fileId 
// Elimina un recurso global específico del disco y de la base de datos
router.delete('/files/:fileId', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.deleteGlobal);

// DELETE /api/admin/system/files/cleanup -> Limpieza masiva de disco
// Elimina todos los archivos de los usuarios dejando solo los globales en disco
router.delete('/system/files/cleanup', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.systemFileCleanup);


/*******************************************************************************
* MÉTRICAS
*******************************************************************************/

// Ruta: GET /api/admin/metrics
// Recupera estadísticas globales
router.get('/metrics', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.getDashboardMetrics);


/*******************************************************************************
* CONFIGURACIÓN DEL SISTEMA
*******************************************************************************/

// GET /api/admin/settings
// Recupera la configuración dinámica actual del sistema
router.get('/settings', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.getSystemSettings);

// PATCH /api/admin/settings/registration
// Activa o desactiva el registro de usuarios
router.patch('/settings/registration', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.toggleRegistrationStatus);

// PUT /api/admin/settings/timeout 
// Modifica el tiempo máximo permitido de ejecución
router.put('/settings/timeout', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.updateExecutionTimeout);

// PUT /api/admin/settings/storage
// Actualiza la cuota máxima de almacenamiento por usuario
router.put('/settings/storage', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.updateStorageQuota);

// PUT /api/admin/settings/concurrency 
// Configura el número de tareas de forma concurrente que ejecuta
router.put('/settings/concurrency', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.updateWorkerConcurrency);

// PUT /api/admin/settings/tokens-reset
// Configura la renovación automática de tokens
router.put('/settings/tokens-reset', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.updateTokenResetSettings);

// PUT /api/admin/settings/session-expiration
// Configura la duración de validez de los JWT
router.put('/settings/session-expiration', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.updateTokenExpiration);


/*******************************************************************************
* AUDITORÍA Y SEGURIDAD
*******************************************************************************/

// GET /api/admin/tasks/:taskId/code
// Recupera el código fuente original de una ejecución específica para auditoría
router.get('/tasks/:taskId/code', authMiddleware.verifyToken, authMiddleware.isAdmin, adminController.getTaskCode);


// Exporta el router admin para integrarlo en Express
export default router;