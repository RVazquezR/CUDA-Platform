/*******************************************************************************
 * ARCHIVO: file.service.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Servicio encargado de gestionar todas las operaciones relacionadas con los  *
 * archivos de la plataforma. Centraliza la comunicación con la API REST para  *
 * recuperar, subir, descargar y eliminar archivos personales o globales,      *
 * proporcionando una capa de abstracción entre los componentes Angular y el   *
 * sistema de almacenamiento del Backend.                                      *
 *******************************************************************************/

import { Injectable, inject } from '@angular/core';               // Decoradores inyección de dependencias proporcionados por Angular
import { HttpClient } from '@angular/common/http';                // Cliente HTTP utilizado para comunicarse con la API REST
import { environment } from '../../../environments/environment';  // Variables de configuración dependientes del entorno
import { FileItem, FileResponse } from '../models/user.model';    // Interfaces tipadas asociadas a los archivos de la plataforma
import { Observable, map } from 'rxjs';                           // Utilidades reactivas utilizadas para transformar respuestas HTTP

/*
 * Registra el servicio en el inyector raíz de Angular, garantizando
 * una única instancia compartida (Singleton) en toda la aplicación.
 */
@Injectable({
  providedIn: 'root'
})

export class FileService {

  // Inyecta el cliente HTTP para habilitar las comunicaciones de red
  private http = inject(HttpClient);

  // URL base de la API REST obtenida desde la configuración del entorno
  private API_URL = `${environment.apiUrl}/files`;

  /*
   * Recupera el listado completo de archivos personales del usuario
   * autenticado.
   */
  getMyFiles(): Observable<FileItem[]> {
    return this.http.get<FileResponse>(this.API_URL).pipe(

      // Extrae únicamente la colección de archivos del payload recibido
      map(response => response.data)
    );
  }

  /*
   * Recupera el listado de archivos globales compartidos por el administrador 
   * para todos los usuarios 
   */
  getGlobalFiles(): Observable<FileItem[]> {
    return this.http.get<FileResponse>(`${this.API_URL}/global`).pipe(
      map(response => response.data)
    );
  }

  /*
   * Envía un archivo local hacia el servidor para que sea almacenado dentro
   * del espacio personal del usuario
   */
  uploadFile(file: File): Observable<any> {

    // Construye un contenedor multipart para transportar el archivo
    const formData = new FormData();

    // Inserta el archivo físico dentro de la petición
    formData.append('file', file);

    // Envía el contenido al endpoint de subida
    return this.http.post(`${this.API_URL}/upload`, formData);
  }

  /*
   * Elimina un archivo personal perteneciente al usuario autenticado
   */
  deleteFile(fileId: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${fileId}`);
  }

  /*
   * Descarga un archivo almacenado en la plataforma devolviendo el contenido
   * binario para que pueda ser procesado por el navegador.
   */
  downloadFile(fileId: number): Observable<Blob> {

    // Solicita el recurso físico asociado al identificador indicado
    return this.http.get(`${this.API_URL}/download/${fileId}`, {

      // Indica a Angular que la respuesta es binaria y no JSON
      responseType: 'blob'
    });
  }
}