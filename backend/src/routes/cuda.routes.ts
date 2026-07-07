/*******************************************************************************
 * ARCHIVO: cuda.routes.ts                                                     *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Define las rutas relacionadas con la ejecución de código CUDA.              *
 * Permite enviar tareas a la cola, consultar estados, recuperar               *
 * ejecuciones y cancelar procesos activos de forma segura.                    *
 *******************************************************************************/

import { Router } from 'express';                                       // Router nativo de Express para agrupar endpoints
import { cudaController } from '../controllers/cuda.controller.js';     // Controlador que contiene la lógica CUDA
import { authMiddleware } from '../middlewares/auth.middleware.js';     // Middleware de seguridad para verificar JWT y roles
import { cudaLimiter } from '../middlewares/rate-limit.middleware.js';  // Middleware anti-spam y limitador de peticiones

// Instancia aislada del router CUDA
const router = Router();

/*
 * Todas las rutas CUDA requieren autenticación JWT válida
 * verifyToken garantiza que el usuario esté autenticado
 */

/*******************************************************************************
* EJECUCIÓN DE CÓDIGO CUDA
*******************************************************************************/

// POST /api/cuda/execute
// Envía código CUDA a la cola para su compilación y ejecución
// cudaLimiter evita abusos y saturación del sistema
router.post('/execute', authMiddleware.verifyToken, cudaLimiter, cudaController.executeCode);


/*******************************************************************************
* CONSULTA Y RECUPERACIÓN DE TAREAS
*******************************************************************************/

// GET /api/cuda/active-task
// Recupera la tarea activa actualmente asociada al usuario
router.get('/active-task', authMiddleware.verifyToken, cudaController.getActiveTask);

// GET /api/cuda/task/:taskId
// Consulta el estado actual de una tarea específica
router.get('/task/:taskId', authMiddleware.verifyToken, cudaController.getTaskStatus);

// GET /api/cuda/last-execution
// Recupera la última ejecución CUDA registrada del usuario
router.get('/last-execution', authMiddleware.verifyToken, cudaLimiter, cudaController.getLastExecution);


/*******************************************************************************
* CANCELACIÓN DE TAREAS
*******************************************************************************/

// DELETE /api/cuda/task/:taskId
// Cancela una tarea activa o pendiente del usuario
router.delete('/task/:taskId', authMiddleware.verifyToken, cudaController.cancelTask);



// Exporta el router CUDA para integrarlo en Express
export default router;