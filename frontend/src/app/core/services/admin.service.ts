/*******************************************************************************
 * ARCHIVO: admin.service.ts                                                   *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
* DESCRIPCIÓN:                                                                 *
 * Servicio centralizado para la administración global de la plataforma.       *
 * Proporciona los métodos necesarios para que los usuarios con rol de         *
 * administrador gestionen cuentas, configuren las cuotas de hardware, operen  *
 * sobre el motor de colas (GPU) y consulten las métricas del sistema.         *
 *******************************************************************************/

import { Injectable, inject } from '@angular/core';               // Decoradores inyección de dependencias proporcionados por Angular
import { HttpClient } from '@angular/common/http';                // Cliente HTTP para comunicación con la API REST
import { environment } from '../../../environments/environment';  // Configuración variables de entorno
import { Observable, map } from 'rxjs';                           // Utilidades reactivas de RxJS

/*
 * Representa la estructura de un usuario cuando es consultado desde el panel
 * de administración. No incluye la bandera de cambio forzado de contraseña
 */
export interface AdminUserRecord {
  id: number;                         // Identificador único del usuario    
  name: string;                       // Nombre completo del usuario
  email: string;                      // Correo electrónico de acceso
  role: 'admin' | 'normal';           // Rol que determina el nivel de privilegios
  tokens: number;                     // Saldo de ejecuciones restantes
  last_token_renewal: string;         // Marca de tiempo de la última recarga de tokens
  created_at: string;                 // Fecha de alta en la plataforma
  is_active: boolean;                 // Bandera que determina si está suspendido o activado
  password_reset_requested: boolean;  // Indica si el usuario ha solicitado recuperar su contraseña
}

/*
 * Define la estructura de las métricas en tiempo real recopiladas por el
 * servidor para monitorizar la plataforma.
 */
export interface DashboardMetrics {
  overview: {
    totalUsers: number;               // Total de cuentas registradas
    totalFiles: number;               // Total de archivos en el disco
    totalTasks: number;               // Total de algoritmos ejecutados
  };
  tasksByStatus: {
    completed?: number;               // Tareas finalizadas exitosamente
    failed?: number;                  // Tareas que devolvieron errores de compilación o ejecución
    cancelled?: number;               // Tareas abortadas por el usuario o por el administrador
    pending?: number;                 // Tareas en cola esperando
    processing?: number;              // Tareas ejecutándose
  };
  recentActivity: Array<{
    id: number;                       // Identificador de la tarea
    status: string;                   // Estado de la ejecución
    created_at: string;               // Marca de tiempo de la creación
    name: string;                     // Nombre del propietario de la tarea
  }>;
}

/*
 * Decorador que registra el servicio en el inyector raíz de Angular,
 * aplicando el patrón Singleton (una única instancia para toda la aplicación)
 */
@Injectable({
  providedIn: 'root'
})

export class AdminService {

  // Inyecta el cliente HTTP para habilitar las comunicaciones de red
  private http = inject(HttpClient);

  // URL base de todos los endpoints administrativos
  private API_URL = `${environment.apiUrl}/admin`;

  /*****************************************************************************
  * MÉTRICAS DEL SISTEMA
  *****************************************************************************/
    
  // Recupera las métricas globales
  getMetrics(): Observable<DashboardMetrics> {
    return this.http.get<{status: string, data: DashboardMetrics}>(`${this.API_URL}/metrics`)
      .pipe(map(res => res.data));
  }

  /*****************************************************************************
  * GESTIÓN DE USUARIOS
  *****************************************************************************/
    
  
  // Recupera el listado completo de usuarios registrados
  getAllUsers(): Observable<AdminUserRecord[]> {
    return this.http.get<{status: string, data: AdminUserRecord[]}>(`${this.API_URL}/users`)
      .pipe(map(res => res.data));
  }

  // Actualiza la información almacenada de un usuario
  updateUser(userId: number, data: { name?: string; email?: string; role?: string }): Observable<any> {
    return this.http.put(`${this.API_URL}/users/${userId}`, data);
  }

  
  // Activa o suspende una cuenta de usuario
  toggleUserStatus(userId: number, isActive: boolean): Observable<any> {
    return this.http.patch(`${this.API_URL}/users/${userId}/status`, { is_active: isActive });
  }

  
  // Elimina permanentemente una cuenta del sistema
  deleteUser(userId: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/users/${userId}`);
  }


  // Elimina todas las cuentas de estudiantes registradas
  deleteAllStudents(): Observable<any> {
    return this.http.delete(`${this.API_URL}/users/purge/students`);
  }

  
  // Genera una contraseña temporal para un usuario
  forcePasswordReset(userId: number): Observable<any> {
    return this.http.post(`${this.API_URL}/users/${userId}/force-reset`, {});
  }

  /*****************************************************************************
  * GESTIÓN DE TOKENS
  *****************************************************************************/

  // Modifica el saldo de tokens de un estudiante
  updateTokens(userId: number, action: 'add' | 'remove' | 'set', amount: number): Observable<any> {
    return this.http.put(`${this.API_URL}/students/${userId}/tokens`, { action, amount });
  }

  /*****************************************************************************
  * CONTROL DE LA COLA DE PROCESAMIENTO
  *****************************************************************************/

  // Detiene temporalmente el procesamiento de nuevas tareas
  pauseQueue(): Observable<any> {
    return this.http.post(`${this.API_URL}/queue/pause`, {});
  }

  // Reanuda el procesamiento normal de la cola
  resumeQueue(): Observable<any> {
    return this.http.post(`${this.API_URL}/queue/resume`, {});
  }

  // Elimina todas las tareas pendientes de ejecución
  clearQueue(): Observable<any> {
    return this.http.delete(`${this.API_URL}/queue/clear`);
  }

  /*****************************************************************************
  * GESTIÓN DE RECURSOS GLOBALES
  *****************************************************************************/

  // Sube un archivo compartido para todos los usuarios
  uploadGlobalFile(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.API_URL}/files/upload`, formData);
  }

  // Elimina un archivo global del sistema
  deleteGlobalFile(fileId: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/files/${fileId}`);
  }

  /*****************************************************************************
  * CONFIGURACIÓN GLOBAL DEL SISTEMA DINÁMICA
  *****************************************************************************/

  // Activa o desactiva el registro de nuevos usuarios
  toggleRegistrationStatus(enable: boolean): Observable<any> {
    return this.http.patch(`${this.API_URL}/settings/registration`, { enable });
  }

  // Recupera la configuración global del sistema
  getSystemSettings(): Observable<any> {
    return this.http.get(`${this.API_URL}/settings`);
  }

  // Modifica el tiempo máximo permitido para una ejecución
  updateExecutionTimeout(timeoutSeconds: number): Observable<any> {

    // Convierte segundos a milisegundos antes del envío
    return this.http.put(`${this.API_URL}/settings/timeout`, { timeout_ms: timeoutSeconds * 1000 });
  }

  // Elimina todos los archivos almacenados de los estudiantes
  cleanupSystemFiles(): Observable<any> {
    return this.http.delete(`${this.API_URL}/system/files/cleanup`);
  }

  // Modifica la cuota máxima de almacenamiento
  updateStorageQuota(quotaMB: number): Observable<any> {
    return this.http.put(`${this.API_URL}/settings/storage`, { quota_mb: quotaMB });
  }

  // Modifica la concurrencia del Worker CUDA
  updateWorkerConcurrency(concurrency: number): Observable<any> {
    return this.http.put(`${this.API_URL}/settings/concurrency`, { concurrency });
  }

  // Modifica la programación de renovación de tokens
  updateTokenResetSettings(time: string, amount: number): Observable<any> {
    return this.http.put(`${this.API_URL}/settings/tokens-reset`, { time, amount });
  }

  // Modifica la duración máxima de las sesiones
  updateSessionExpiration(hours: number): Observable<any> {
    return this.http.put(`${this.API_URL}/settings/session-expiration`, { hours });
  }

  /*****************************************************************************
  * AUDITORÍA Y SEGURIDAD
  *****************************************************************************/

  // Recupera el código fuente original de una tarea específica
  getTaskCode(taskId: number): Observable<string> {
    return this.http.get<{status: string, data: { source_code: string }}>(`${this.API_URL}/tasks/${taskId}/code`)
      .pipe(map(res => res.data.source_code));
  }
}