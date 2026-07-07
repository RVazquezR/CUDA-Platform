/*******************************************************************************
 * ARCHIVO: email.service.ts                                                   *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Pasarela de integración con servicios de mensajería (Resend).               *
 * Despacha correos electrónicos como los códigos de un solo uso (PIN)         *
 * necesarios para la recuperación de credenciales de usuario.                 *
 *******************************************************************************/

import { Resend } from 'resend';                    // SDK oficial de Resend para envío de correos electrónicos
import dotenv from 'dotenv';                        // Librería para cargar variables de entorno desde .env
import { logger } from '../utils/logger.util.js';   // Registrar actividad del servidor en logs

// Carga automáticamente las variables de entorno definidas en .env
dotenv.config();

// Inicializamos Resend con la clave del .env
// Si no existe clave configurada, el servicio funcionará en modo simulado
const resend = new Resend(process.env.RESEND_API_KEY || 'clave_no_configurada');

export const emailService = {
    
    /*
     * Envía un correo con plantilla HTML de recuperación de contraseña con un 
     * PIN temporal, utilizando Resend como proveedor SMTP externo
     */
    async sendPasswordResetEmail(toEmail: string, pin: string): Promise<void> {

        // Verifica si la API Key de Resend está configurada
        if (!process.env.RESEND_API_KEY) {
            logger.warn(`[Email Service] RESEND_API_KEY no configurada. Simulando envío del PIN: ${pin} a ${toEmail}`);
            return;
        }

        try {

            // Construye y envía el correo HTML de recuperación
            const { data, error } = await resend.emails.send({

                // Remitente mostrado al usuario final
                from: 'Plataforma CUDA <onboarding@resend.dev>',

                // Dirección de destino del usuario
                to: toEmail,

                // Asunto del correo electrónico
                subject: 'Código de Recuperación de Contraseña',

                // Plantilla HTML enviada al usuario
                html: `
                    <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; padding: 20px; border: 1px solid #333; background-color: #050505; color: #fff; border-radius: 10px;">
                        <h2 style="color: #8ED300; text-align: center;">Plataforma CUDA</h2>
                        <p>Hola,</p>
                        <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta asociada a este correo.</p>
                        <p>Tu código de seguridad temporal (PIN) de 6 dígitos es:</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 15px 25px; background-color: #1a1a1a; border-radius: 8px; border: 1px solid #333; color: #fff;">
                                ${pin}
                            </span>
                        </div>
                        
                        <p style="color: #888; font-size: 12px; text-align: center;">
                            Este código caducará en 15 minutos.<br>
                            Si no has solicitado este cambio, puedes ignorar este correo de forma segura.
                        </p>
                    </div>
                `
            });

            // Verifica si Resend devolvió un error durante el envío
            if (error) {

                logger.error(`[Email Service] Error de Resend al enviar a ${toEmail}:`, 
                    error
                );

                throw new Error('Error al enviar el correo desde el proveedor.');
            }

            // Confirma en la consola el éxito del correo
            logger.info(`[Email Service] Correo de recuperación enviado con éxito a ${toEmail}`);
            
        } catch (err: any) {

            // Registra excepciones inesperadas de la librería
            logger.error(`[Email Service] Excepción crítica al enviar correo:`, err);
            throw err;
        }
    }
};