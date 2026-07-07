/*******************************************************************************
 * ARCHIVO: socket.service.ts                                                  *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Gestor de comunicaciones bidireccionales en tiempo real (WebSockets).       *
 * Permite al backend empujar actualizaciones de estado directamente al        *
 * navegador del alumno sin que este tenga que recargar.                       *
 *******************************************************************************/

import { Server, Socket } from 'socket.io';         // Servidor principal y tipos de conexión de Socket.IO
import { Server as HttpServer } from 'http';        // Tipo del servidor HTTP nativo de Node.js
import jwt from 'jsonwebtoken';                     // Tipo del servidor HTTP nativo de Node.js
import dotenv from 'dotenv';                        // Librería para cargar variables de entorno desde .env
import { logger } from '../utils/logger.util.js';   // Registrar actividad del servidor en logs

// Carga automáticamente las variables de entorno definidas en .env
dotenv.config();

class SocketService {

    // Instancia principal del servidor Socket.io
    private io: Server | null = null;

    // Mapa de enrutamiento en memoria RAM
    // Vincula el ID de usuario de MySQL con su ID de conexión de Socket.io
    private connectedUsers: Map<number, string> = new Map();

    /*
     * Inicializa el servidor Socket.IO acoplándolo al servidor HTTP existente
     * Configura las barreras CORS, los escudos de autenticación y la gestión
     * de conexiones
     */
    initialize(server: HttpServer) {

        // Extrae la URL del frontend para aplicar restricciones CORS estrictas
        const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

        // Crea el servidor WebSocket adjunto al servidor HTTP
        this.io = new Server(server, {

            cors: {

                // Restringe conexiones únicamente al frontend autorizado
                origin: FRONTEND_URL,

                // Métodos HTTP permitidos durante el handshake
                methods: ['GET', 'POST'],

                // Permite envío de credenciales y cookies
                credentials: true
            }
        });

        // Middleware de autenticación JWT
        // Valida que cada socket posea un JWT válido antes de conectarse
        this.io.use((socket, next) => {

            // Recupera el token enviado durante la conexión
            const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];
            
            // Bloquea conexiones sin token
            if (!token) {
                return next(new Error('Acceso denegado: No se proporcionó token'));
            }

            try {

                // Elimina el prefijo "Bearer " si existe
                const actualToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

                // Verifica la firma y validez del JWT
                const decoded = jwt.verify(actualToken, process.env.JWT_SECRET || 'tu_secreto_aqui') as any;
                
                // Guarda el userId dentro de la sesión del socket
                socket.data.userId = decoded.userId;

                // Autoriza la conexión
                next();

            } catch (error) {

                // Bloquea conexiones con JWT inválido o expirado
                return next(new Error('Acceso denegado: Token inválido o expirado'));
            }
        });

        // Gestion de conexiones
        // Se ejecuta automáticamente cuando un cliente se conecta
        this.io.on('connection', (socket: Socket) => {

            // Recupera el userId autenticado del socket
            const userId = socket.data.userId;
            
            // Registra el socket activo asociado al usuario
            this.connectedUsers.set(userId, socket.id);
            logger.info(`[WebSocket] Usuario ID:${userId} conectado (Socket: ${socket.id})`);

            // Gestion de desconexiones
            // Se ejecuta automáticamente cuando el cliente se desconecta
            socket.on('disconnect', () => {

                // Elimina el socket del mapa de conexiones activas
                this.connectedUsers.delete(userId);
                logger.info(`[WebSocket] Usuario ID:${userId} desconectado`);
            });
        });
    }

    /*
     * Emisor Unicast (Mensaje Privado)
     * Envía un evento privado a un único usuario conectado
     * Utiliza el socketId asociado al userId autenticado e inyecta evento
     */
    notifyUser(userId: number, event: string, data: any) {

        // Verifica que el servidor Socket.IO esté inicializado
        if (!this.io) return;
        
        // Recupera el socket asociado al usuario
        const socketId = this.connectedUsers.get(userId);

        // Envía el evento únicamente si el usuario está conectado
        if (socketId) {
            this.io.to(socketId).emit(event, data);
        }
    }

    /*
     * Emisor Multicast (Mensaje Global)
     * Envía un evento global a todos los clientes conectados
     * Usado para notificaciones o eventos compartidos
     */
    broadcast(event: string, data: any) {

        // Verifica que el servidor Socket.IO esté inicializado
        if (!this.io) return;

        // Emite el evento a todos los sockets activos
        this.io.emit(event, data);
    }
}

/*
 * Exporta una única instancia global del servicio WebSocket
 * Implementa el patrón Singleton para reutilización centralizada
 */
export const socketService = new SocketService();