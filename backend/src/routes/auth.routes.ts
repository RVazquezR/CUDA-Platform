/*******************************************************************************
 * ARCHIVO: auth.routes.ts                                                     *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Define las rutas públicas y protegidas relacionadas con autenticación       *
 * y recuperación de credenciales del sistema.                                 *
 * Gestiona registro, login, recuperación de contraseña y cambios              *
 * forzados de credenciales mediante JWT.                                      *
 *******************************************************************************/

import { Router } from 'express';                                   // Router nativo de Express para agrupar endpoints
import { authController } from '../controllers/auth.controller.js'; // Controlador que contiene la lógica de autenticación
import { authMiddleware } from '../middlewares/auth.middleware.js'; // Middleware de seguridad para verificar JWT y roles

// Instancia aislada del router de autenticación
const router = Router();


/*******************************************************************************
* CONSULTAS DE ESTADO DEL SISTEMA
*******************************************************************************/

// GET /api/auth/registration-status
// Consulta si el sistema permite actualmente nuevos registros de usuarios
router.get('/registration-status', authController.getRegistrationStatus);


/*******************************************************************************
* AUTENTICACIÓN
*******************************************************************************/

// POST /api/auth/register
// Registra un nuevo usuario en la plataforma
router.post('/register', authController.register);

// POST /api/auth/login
// Autentica credenciales y devuelve un JWT válido
router.post('/login', authController.login);


/*******************************************************************************
* RECUPERACIÓN DE CONTRASEÑA
*******************************************************************************/

// POST /api/auth/forgot-password/admin
// Solicita intervención manual del administrador para recuperar acceso
router.post('/forgot-password/admin', authController.requestAdminHelp);

// POST /api/auth/forgot-password/email
// Genera y envía un PIN temporal de recuperación mediante correo
router.post('/forgot-password/email', authController.requestEmailToken);

// POST /api/auth/reset-password/email
// Valida el PIN recibido y establece una nueva contraseña
router.post('/reset-password/email', authController.resetWithToken);


/*******************************************************************************
* CAMBIO FORZADO DE CONTRASEÑA
*******************************************************************************/

// POST /api/auth/change-forced-password
// Permite sustituir la contraseña temporal asignada por el administrado
// Solo accesible si has hecho login con la contraseña temporal
router.post('/change-forced-password', authMiddleware.verifyToken, authController.changeForcedPassword);



// Exporta el router auth para integrarlo en Express
export default router;