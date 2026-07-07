/*******************************************************************************
 * ARCHIVO: user.service.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Servicio encargado de gestionar todas las operaciones relacionadas con el   *
 * perfil del usuario autenticado. Centraliza las peticiones para consultar la *
 * identidad, actualizar credenciales y recuperar la telemetría individual     *
 * sobre el consumo de cuotas y ejecuciones.
 *******************************************************************************/

import { Injectable, inject } from '@angular/core';               // Decoradores inyección de dependencias proporcionados por Angular
import { HttpClient } from '@angular/common/http';                // Cliente HTTP utilizado para comunicarse con la API REST
import { environment } from '../../../environments/environment';  // Variables de configuración dependientes del entorno
import { Observable } from 'rxjs';                                // Flujos de datos asíncronos de la librería RxJS

/*
 * Representa la estructura de identidad extendida del usuario en sesión.
 * Excluye datos de autenticación y sirve para rellenar el panel de perfil
 */
export interface UserProfile {
  id: number;                       // Identificador único del usuario
  name: string;                     // Nombre completo usuario
  email: string;                    // Correo electrónico de acceso
  role: 'admin' | 'normal';         // Rol asignado dentro de la plataforma
  tokens: number;                   // Cantidad de tokens disponibles
  last_token_renewal: string;       // Fecha de la última renovación de tokens
  created_at: string;               // Fecha de creación de la cuenta
}

/*
 * Define la estructura de las métricas avanzadas asociadas al usuario.
 * Permite visualizar información estadística relacionada con las
 * ejecuciones CUDA y el almacenamiento consumido.
 */
export interface AdvancedMetrics {

  // Métricas relacionadas con las ejecuciones realizadas
  executions: {
    
    total: number;                  // Número total de ejecuciones registradas
    completed: number;              // Ejecuciones completadas correctamente
    failed: number;                 // Ejecuciones finalizadas con error
    cancelled: number;              // Ejecuciones canceladas por el usuario o administrador
    pending_or_processing: number;  // Ejecuciones pendientes o en procesamiento
  };

  // Métricas relacionadas con el almacenamiento
  storage: {

    total_files: number;            // Número total de archivos almacenados
    total_bytes: number;            // Espacio total ocupado en bytes
  };

  quotaMB?: number;                 // Cuota máxima de almacenamiento permitida
}

/*
 * Registra el servicio en el inyector raíz de Angular, garantizando
 * una única instancia compartida (Singleton) en toda la aplicación.
 */
@Injectable({
  providedIn: 'root'
})

export class UserService {

  // Inyecta el cliente HTTP para habilitar las comunicaciones de red
  private http = inject(HttpClient);

  // URL base de la API REST obtenida desde la configuración del entorno
  private API_URL = `${environment.apiUrl}/users`;

  /*
   * Recupera la información completa del perfil del usuario autenticado
   */
  getProfile(): Observable<{status: string, data: UserProfile}> {
    return this.http.get<{status: string, data: UserProfile}>(`${this.API_URL}/profile`);
  }

  /*
   * Recupera las métricas personales del usuario
   */
  getMetrics(): Observable<{status: string, data: AdvancedMetrics}> {
    return this.http.get<{status: string, data: AdvancedMetrics}>(`${this.API_URL}/metrics`);
  }

  /*
   * Actualiza los datos del perfil del usuario autenticado que tiene permitido
   */
  updateProfile(data: { name?: string; password?: string }): Observable<any> {
    return this.http.put(`${this.API_URL}/profile`, data);
  }
}