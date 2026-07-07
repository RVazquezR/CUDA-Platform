/*******************************************************************************
 * ARCHIVO: express.d.ts                                                       *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Extiende los tipos nativos de Express para incluir información              *
 * adicional de autenticación dentro del objeto Request.                       *
 * Permite acceder a req.user de forma tipada y segura.                        *
 *******************************************************************************/

import { Request } from 'express';                      // Interfaz original de las peticiones HTTP de la librería Express
import { JwtPayload } from '../models/user.model.js';   // Define la estructura del token

/*
 * Extiende la interfaz Request original de Express
 * Hereda todas las propiedades de una petición normal pero añade el usuario 
 * autenticado inyectado por el middleware JWT
 */
export interface AuthRequest extends Request {

    // Información del usuario autenticado extraída del JWT
    // ? porque otras rutas no tendrán esta propiedad
    user?: JwtPayload;
}