/*******************************************************************************
 * ARCHIVO: cuda.service.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Centraliza las operaciones encargadas de gestionar todas las operaciones    *
 * relacionadas con el ciclo de vida de las ejecuciones CUDA                   *
 *******************************************************************************/

import { Injectable, inject } from '@angular/core';               // Decoradores y primitivas reactivas proporcionadas por Angular
import { HttpClient } from '@angular/common/http';                // Cliente HTTP utilizado para comunicarse con la API REST
import { environment } from '../../../environments/environment';  // Variables de configuración dependientes del entorno
import { Observable } from 'rxjs';                                // Flujos de datos asíncronos de la librería RxJS

/*
 * Registra el servicio en el inyector raíz de Angular, garantizando
 * una única instancia compartida (Singleton) en toda la aplicación.
 */
@Injectable({
  providedIn: 'root'
})

export class CudaService {

  // Inyecta el cliente HTTP para habilitar las comunicaciones de red
  private http = inject(HttpClient);

  // URL base de la API REST obtenida desde la configuración del entorno
  private API_URL = `${environment.apiUrl}/cuda`;

  /*
   * Envía el código fuente al Backend para que sea encolado para su 
   * posterior ejecución
   */
  executeCode(code: string): Observable<any> {
    return this.http.post(`${this.API_URL}/execute`, { code });
  }

  /*
   * Solicita la cancelación de una tarea que se encuentra pendiente o en
   * ejecución
   */
  cancelTask(taskId: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/task/${taskId}`);
  }

  /*
   * Consulta si el usuario posee una tarea activa
   */
  getActiveTask(): Observable<{status: string, data: {taskId: string, status: string} | null}> {
    return this.http.get<any>(`${this.API_URL}/active-task`);
  }

  /*
   * Recupera el saldo de tokens disponible para el usuario en tiempo real
   */
  getUserTokens(): Observable<{status: string, data: {tokens: number}}> {
    return this.http.get<{status: string, data: {tokens: number}}>(`${environment.apiUrl}/users/tokens`);
  }

  /*
   * Recupera la salida por consola de la última ejecución realizada por
   * el usuario
   */
  getLastExecution(): Observable<{status: string, data: any}> {
    return this.http.get<any>(`${this.API_URL}/last-execution`);
  }
}