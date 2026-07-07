/*******************************************************************************
 * ARCHIVO: auth.middleware.ts                                                 *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Gestiona la autenticación y autorización de los usuarios.                   *
 * Protege las rutas privadas interceptando las peticiones para verificar la   *
 * validez de los JSON Web Tokens (JWT) y comprobar los privilegios de acceso. *
 *******************************************************************************/

/*
 * Tipos nativos de Express usados para tipar correctamente:
 * - Response: objeto de respuesta HTTP
 * - NextFunction: función para continuar al siguiente middleware
 */
import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';                             // Librería para trabajar con JSON Web Tokens (JWT)
import type { AuthRequest } from '../types/express.js';     // Interfaz personalizada, extiende el objeto Request de Express
import type { JwtPayload } from '../models/user.model.js';  // Tipo que define estructura interna esperada del payload JWT

export const authMiddleware = {
    /*
     * Verifica que la petición contiene un JWT válido y no expirado
     * Extrae la identidad del usuario y la inyecta en la petición para su uso más tarde
     */
    verifyToken(req: AuthRequest, res: Response, next: NextFunction): void {
        // En estándar se envía el token en la cabecera "Authorization" con formato "Bearer <token>"
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ 
                status: 'error', 
                message: 'Acceso denegado. Token no proporcionado o formato inválido.' 
            });
            return; // Detiene la ejecución de la petición
        }

        // Extrae la cadena del token ignorando la palabra "Bearer "
        const token = authHeader.split(' ')[1];

        try {
            const secret = process.env.JWT_SECRET!;
            // Decodifica y valida la firma del token
            const decoded = jwt.verify(token, secret) as JwtPayload;
            
            // Inyectamos los datos del usuario en la petición para que los controladores puedan usarlo
            req.user = decoded; 
            
            // Cede el control al siguiente middleware o controlador en la cadena
            next();
        } catch (error) {
            res.status(403).json({ 
                status: 'error', 
                message: 'Token inválido o ha expirado.' 
            });
        }
    },

    /*
     * Verifica que el usuario autenticado posee privilegios de administrador
     * Debe ejecutarse siempre después de verifyToken en la definición de la ruta
     */
    isAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
        // Comprueba por seguridad si el token fue procesado previamente
        if (!req.user) {
            res.status(401).json({ status: 'error', message: 'Usuario no autenticado.' });
            return;
        }

        // Bloquea el paso a cualquier usuario que no tenga el rol explícito de 'admin'
        if (req.user.role !== 'admin') {
            res.status(403).json({ 
                status: 'error', 
                message: 'Acceso denegado. Se requieren privilegios de administrador.' 
            });
            return;
        }

        // Permite el paso al controlador
        next();
    }
};