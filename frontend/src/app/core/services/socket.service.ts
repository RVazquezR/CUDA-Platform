/*******************************************************************************
 * ARCHIVO: socket.service.ts                                                  *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Servicio encargado de gestionar la comunicación en tiempo real entre el     *
 * Frontend y el Backend mediante WebSockets (Socket.IO). Permite establecer   *
 * conexiones autenticadas utilizando JWT, escuchar eventos emitidos por el    *
 * servidor y recibir información instantánea sobre ejecuciones CUDA, cambios  *
 * de estado y eventos del sistema sin realizar peticiones HTTP.               *
 *******************************************************************************/

import { Injectable, inject } from '@angular/core';               // Decoradores y primitivas reactivas proporcionadas por Angular
import { io, Socket } from 'socket.io-client';                    // Cliente oficial para la gestión de conexiones de Socket.IO
import { environment } from '../../../environments/environment';  // Variables de configuración dependientes del entorno
import { AuthService } from './auth.service';                     // Servicio de autenticación para recuperar el JWT almacenado
import { Observable } from 'rxjs';                                // Flujos de datos asíncronos de la librería RxJS

/*
 * Registra el servicio en el inyector raíz de Angular, garantizando
 * una única conexión persistente (Singleton) por cada sesión de usuario.
 */
@Injectable({
  providedIn: 'root'
})

export class SocketService {

  // Instancia física de la conexión WebSocket
  private socket!: Socket;

  // Servicio de autenticación utilizado para recuperar el token JWT
  private authService = inject(AuthService);

  /*
   * Establece una conexión autenticada con el servidor Socket.IO utilizando el
   * token JWT almacenado en el navegador
   */
  connect() {

    // Recupera el token de sesión actual
    const token = this.authService.getToken();

    // Si no existe sesión válida se cancela la conexión
    if (!token) return;

    // Instancia el cliente Socket.IO enviando el token en la cabecera de 
    // autenticación del socket
    this.socket = io(environment.wsUrl, {
      auth: { token: token },

      // Fuerza el uso exclusivo del protocolo WebSocket
      transports: ['websocket']
    });

    // Evento disparado cuando la conexión se establece correctamente
    this.socket.on('connect', () => {
      console.log('Conectado al motor de eventos en tiempo real CUDA');
    });

    // Evento disparado si se produce un error de conexión
    this.socket.on('connect_error', (err) => {
      console.error('Error de conexión WebSocket:', err.message);
    });
  }

  /*
   * Convierte la recepción pasiva de eventos nativos de Socket.IO en un flujo
   * de datos reactivo (Observable). Esto permite a los componentes de Angular
   * aplicar operadores funcionales (map, filter) y suscribirse de forma estándar.
   */
  listen<T>(eventName: string): Observable<T> {
    return new Observable((subscriber) => {

      // Si la conexión aún no existe se inicializa automáticamente
      if (!this.socket) {
        this.connect();
      }

      // Delega la emisión asíncrona de los datos entrantes hacia el observador suscrito
      this.socket.on(eventName, (data: T) => {
        subscriber.next(data);
      });
    });
  }

  /*
   * Cierra de forma controlada la conexión WebSocket activa liberando recursos
   * tanto en el navegador como en el servidor.
   */
  disconnect() {

    // Verifica que exista una conexión activa
    if (this.socket) {

      // Cierra el canal de comunicación físico
      this.socket.disconnect();
      console.log('Desconectado del motor de eventos');
    }
  }
}