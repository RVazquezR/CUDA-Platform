/*******************************************************************************
 * ARCHIVO: user.routes.ts                                                     *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Define las rutas relacionadas con la gestión del área personal del alumno.  *
 * Permite la consulta de métricas de uso, actualización de datos de perfil    *
 * y la verificación del saldo de tokens disponibles para compilar.            *
 *******************************************************************************/

import { Router } from 'express';                                   // Router nativo de Express para agrupar endpoints
import { userController } from '../controllers/user.controller.js'; // Controlador que contiene la lógica del área personal del alumno
import { authMiddleware } from '../middlewares/auth.middleware.js'; // Middleware de seguridad para verificar JWT y roles

// Instancia aislada del router de usuario
const router = Router();

/*
 * Todas las rutas requieren autenticación JWT válida
 * verifyToken garantiza que el usuario esté autenticado
 */


/*******************************************************************************
* PERFIL DE USUARIO
*******************************************************************************/

// GET /api/users/profile
// Recupera el perfil completo y estadísticas básicas del usuario
router.get('/profile', authMiddleware.verifyToken, userController.getProfile);

// PUT /api/users/profile
// Actualiza la información editable del perfil del usuario
router.put('/profile', authMiddleware.verifyToken, userController.updateProfile);


/*******************************************************************************
* MÉTRICAS
*******************************************************************************/

// NUEVO: GET /api/users/metrics
// GET /api/users/metrics
// Recupera métricas avanzadas del usuario
router.get('/metrics', authMiddleware.verifyToken, userController.getMetrics);

// GET /api/users/tokens
// Recupera el saldo actual de tokens del usuario
router.get('/tokens', authMiddleware.verifyToken, userController.getTokens);

// Exporta el router de usuario para integrarlo en Express
export default router;