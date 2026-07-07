/*******************************************************************************
 * ARCHIVO: auth.controller.ts                                                 *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Controlador central para la gestión de identidades y accesos.               *
 * Contiene el registro de usuarios, inicio de sesión, validación de           *
 * credenciales y protocolos de recuperación.                                  *
 *******************************************************************************/

import type { Request, Response } from 'express';               // Tipos nativos de Express para peticiones y respuestas HTTP
import type { RowDataPacket } from 'mysql2';                    // Tipado oficial de mysql2 para lectura de datos SQL
import { authService } from '../services/auth.service.js';      // Interfaz extendida que contiene el payload del JWT
import pool from '../config/db.config.js';                      // Pool de conexiones reutilizable hacia la base de datos
import type { AuthRequest } from '../types/express.js';         // Servicio central de gestión de identidades y contraseñas
import { emailService } from '../services/email.service.js';    // servicio para recuperación de credenciales

// Expresión regular  que fuerza el uso de contraseñas seguras
// Requiere: 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+[\]{};':"\\|,.<>/?-]).{8,}$/;

export const authController = {

    /*
     * Devuelve públicamente si el sistema permite nuevos registros
     * Utilizado desde el frontend para bloquear el formulario de registro
     * cuando el administrador cierra el acceso
     */
    async getRegistrationStatus(req: Request, res: Response): Promise<void> {
        try {

            // Consulta del estado actual almacenado en configuración
            const [rows] = await pool.query<RowDataPacket[]>(
                "SELECT setting_value FROM system_settings WHERE setting_key = 'registration_enabled'"
            );
            
            // Convierte el valor string a booleano real
            const isEnabled = rows.length > 0 && rows[0].setting_value === 'true';
            
            // Respuesta del estado de registros
            res.status(200).json({ 
                status: 'success', 
                data: { registration_enabled: isEnabled } 
            });

        } catch (error: any) {

            // Error interno inesperado
            res.status(500).json({ status: 'error', message: 'Error interno comprobando el estado del servidor' });
        }
    },

    /*
     * Registra nuevos usuarios dentro del sistema
     * Implementa validación estricta de contraseñas, bloqueo
     * de privilegios y control global de apertura de registros
     */
    async register(req: Request, res: Response): Promise<void> {
        try {

            // Comprueba si los registros están habilitados
            const [settings] = await pool.query<RowDataPacket[]>(
                "SELECT setting_value FROM system_settings WHERE setting_key = 'registration_enabled'"
            );

            // Si el administrador cerró los registros se rechaza
            if (settings.length > 0 && settings[0].setting_value === 'false') {
                res.status(403).json({ 
                    status: 'error', 
                    message: 'Los registros están temporalmente cerrados por el Administrador.' 
                });
                return;
            }

            // Ignora el campo role evitando escaladas de privilegios
            const { name, email, password } = req.body;

            // Validación obligatoria de campos mínimos
            if (!name || !email || !password) {
                res.status(400).json({ status: 'error', message: 'El nombre, email y contraseña son obligatorios' });
                return;
            }

            // Validación de seguridad de contraseña
            if (!PASSWORD_REGEX.test(password)) {
                res.status(400).json({ 
                    status: 'error', 
                    message: 'La contraseña debe tener al menos 8 caracteres, incluir una mayúscula, una minúscula, un número y un carácter especial.' 
                });
                return;
            }

            // Registro seguro forzando siempre el rol 'normal'
            const newUserId = await authService.registerUser(name, email, password, 'normal');

            // Respuesta de éxito
            res.status(201).json({
                status: 'success',
                message: 'Usuario registrado correctamente. Tu cuenta es de tipo normal.',
                data: { userId: newUserId }
            });

        } catch (error: any) {

            // Error del servicio de autenticación
            res.status(400).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Evalúa las credenciales de un usuario y expide su salvoconducto digital
     * Diferencia los códigos de error HTTP según el motivo del rechazo
     */
    async login(req: Request, res: Response): Promise<void> {
        try {

            // Credenciales enviadas desde el cliente
            const { email, password } = req.body;

            // Validación mínima obligatoria
            if (!email || !password) {
                res.status(400).json({ status: 'error', message: 'Email y contraseña son obligatorios' });
                return;
            }

            // Autenticación principal
            const { token, user } = await authService.loginUser(email, password);

            // Login exitoso
            res.status(200).json({
                status: 'success',
                message: 'Login exitoso',
                data: { token, user }
            });

        } catch (error: any) {

            // Extrae el mensaje original de error
            const errorMessage = error.message;

            // Si la cuenta está suspendida devuelve 403 Forbidden
            if (errorMessage.includes('suspendida')) {
                res.status(403).json({ status: 'error', message: errorMessage });
                return;
            }

            // Credenciales inválidas u otros errores de autenticación
            res.status(401).json({ status: 'error', message: errorMessage });
        }
    },

    /***************************************************************************
     * RECUPERACIÓN DE CREDENCIALES
     **************************************************************************/

    /*
     * Solicita ayuda administrativa para recuperar una cuenta
     * Activa una alerta visual en el panel del admin para asistencia manual
     * No revela si el correo existe evitando ataques de escaneo
     */
    async requestAdminHelp(req: Request, res: Response): Promise<void> {
        try {

            // Correo recibido desde el formulario
            const { email } = req.body;

            // Genera la solicitud interna al administrador
            await authService.requestAdminPasswordReset(email);

            // Respuesta estándar de éxito
            res.status(200).json({ status: 'success', message: 'Si el correo existe, se ha notificado al administrador.' });

        } catch (error: any) {

            // Aunque falle devuelve igualmente éxito
            res.status(200).json({ status: 'success', message: 'Si el correo existe, se ha notificado al administrador.' });
        }
    },

    /*
     * Genera y envía un PIN temporal de recuperación por correo
     * Implementa seguridad anti escaneo ocultando la existencia
     * real del email dentro del sistema
     */
    async requestEmailToken(req: Request, res: Response): Promise<void> {
        try {

            // Email recibido desde el cliente
            const { email } = req.body;
            
            // Genera el PIN temporal en base de datos
            const pin = await authService.generateEmailResetToken(email);
            
            // Envío real del correo electrónico de recuperación
            await emailService.sendPasswordResetEmail(email, pin);
            
            // Respuesta estándar segura
            res.status(200).json({ status: 'success', message: 'Si el correo existe, recibirás un PIN con instrucciones en unos segundos.' });

        } catch (error: any) {

            // No revela si el email realmente existe
            res.status(200).json({ status: 'success', message: 'Si el correo existe, recibirás un PIN con instrucciones en unos segundos.' });
        }
    },

    /*
     * Valida PIN recibido en el email del usuario y establece nueva contraseña
     * Exige el cumplimiento de la política de contraseñas segura
     */
    async resetWithToken(req: Request, res: Response): Promise<void> {
        try {

            // Datos recibidos desde el formulario de recuperación
            const { email, token, newPassword } = req.body;

            // Validación de seguridad de la nueva contraseña
            if (!PASSWORD_REGEX.test(newPassword)) {
                res.status(400).json({ status: 'error', message: 'La contraseña no cumple los requisitos de seguridad.' });
                return;
            }

            // Ejecuta el cambio de contraseña usando el PIN
            await authService.resetPasswordWithToken(email, token, newPassword);

            // Confirmación de éxito
            res.status(200).json({ status: 'success', message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
        } catch (error: any) {

            // Error de token inválido, expirado o datos incorrectos
            res.status(400).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Obliga al usuario a reemplazar una contraseña temporal tras loguearse
     * después de un reseteo de contraseña del admin 
     */
    async changeForcedPassword(req: AuthRequest, res: Response): Promise<void> {
        try {

            // ID autenticado obtenido desde el JWT
            const userId = req.user?.userId;

            // Nueva contraseña enviada por el usuario
            const { newPassword } = req.body;

            // Protección frente a usuarios no autenticados
            if (!userId) { res.status(401).json({ status: 'error', message: 'No autorizado' }); return; }

            // Validación estricta de seguridad
            if (!PASSWORD_REGEX.test(newPassword)) {
                res.status(400).json({ status: 'error', message: 'La contraseña no cumple los requisitos.' }); return;
            }

            // Sustituye la contraseña temporal por la definitiva
            await authService.updateForcedPassword(userId, newPassword);

            // Confirmación final
            res.status(200).json({ status: 'success', message: 'Contraseña definitiva establecida con éxito.' });

        } catch (error: any) {

            // Error interno inesperado
            res.status(500).json({ status: 'error', message: error.message });
        }
    }
};