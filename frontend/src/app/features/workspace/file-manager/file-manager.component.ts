/*******************************************************************************
 * ARCHIVO: file-manager.component.ts                                          *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente encargado de la gestión de archivos personales y globales        *
 * dentro de la plataforma. Permite visualizar, subir, descargar, eliminar     *
 * y actualizar el listado de recursos disponibles para el usuario.            *
 *******************************************************************************/

import { Component, inject, signal, OnInit } from '@angular/core';  // Decoradores, señales reactivas e interfaces del ciclo de vida
import { CommonModule } from '@angular/common';                     // Directivas estructurales básicas de Angular
import { FileService } from '../../../core/services/file.service';  // Servicio encargado de la gestión de archivos
import { FileItem } from '../../../core/models/user.model';         // Modelos de tipado estricto para entidades de ficheros

/*
 * Declaración del componente autónomo (Standalone) encargado
 * de la gestión de archivos del usuario
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-file-manager',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias utilizadas por la plantilla
  imports: [CommonModule],

  // Ruta de la plantilla HTML asociada
  templateUrl: './file-manager.component.html'
})

export class FileManagerComponent implements OnInit {

  // Servicio encargado de las operaciones relacionadas con archivos
  private fileService = inject(FileService);

  /*****************************************************************************
   * ESTADOS REACTIVOS
   *****************************************************************************/

  // Almacena los archivos personales del usuario
  myFiles = signal<FileItem[]>([]);

  // Almacena los archivos globales
  globalFiles = signal<FileItem[]>([]);

  // Determina la pestaña actualmente activa
  activeTab = signal<'personal' | 'global'>('personal');

  // Indica si existe una subida de archivos en curso
  isUploading = signal<boolean>(false);

  // Indica si existe una actualización manual en curso
  isRefreshing = signal<boolean>(false);

  // Almacena mensajes de error relacionados con la subida
  uploadError = signal<string | null>(null);

  /*
   * Punto de entrada del ciclo de vida del componente
   * Recupera los archivos iniciales
   */
  ngOnInit() {

    // Carga los archivos personales
    this.loadMyFiles();

    // Carga los archivos globales
    this.loadGlobalFiles();
  }


  /*****************************************************************************
   * CARGA DE ARCHIVOS
   *****************************************************************************/

  /*
   * Recupera los archivos personales del usuario
   */
  loadMyFiles() {

    // Solicita la lista de archivos personales
    this.fileService.getMyFiles().subscribe({

      // Actualiza el estado reactivo
      next: (files) => this.myFiles.set(files),
      error: (err) => console.error('Error cargando archivos personales', err)
    });
  }


  /*
   * Recupera los archivos globales compartidos
   */
  loadGlobalFiles() {

    // Solicita la lista de archivos globales
    this.fileService.getGlobalFiles().subscribe({

      // Actualiza el estado reactivo
      next: (files) => this.globalFiles.set(files),
      error: (err) => console.error('Error cargando archivos globales', err)
    });
  }

  /*****************************************************************************
   * SUBIDA DE ARCHIVOS
   *****************************************************************************/

  /*
   * Procesa la selección del archivo para subir a los archivos personales
   */
  onFileSelected(event: any) {

    // Recupera el archivo seleccionado
    const file: File = event.target.files[0];

    // Continúa únicamente si existe un archivo válido
    if (file) {
      
      // Elimina errores anteriores
      this.uploadError.set(null);

      // Activa el estado visual de subida
      this.isUploading.set(true);

      // Envía el archivo al backend
      this.fileService.uploadFile(file).subscribe({

        next: () => {

          // Finaliza el estado visual de subida
          this.isUploading.set(false);

          // Recarga el listado actualizado
          this.loadMyFiles();
        },
        error: (err) => {

          // Finaliza el estado visual de subida
          this.isUploading.set(false);
          
          // Recupera el mensaje de error devuelto por el backend
          const errorMsg = err.error?.message || 'Error de conexión con el servidor.';
          
          // Muestra el error en la interfaz
          this.uploadError.set(errorMsg);

          // Elimina automáticamente el mensaje
          setTimeout(() => {
            this.uploadError.set(null);
          }, 6000);
        }
      });
    }
  }

  /*****************************************************************************
   * ELIMINACIÓN DE ARCHIVOS
   *****************************************************************************/

  /*
   * Elimina un archivo personal seleccionado por el usuario
   */
  deleteFile(fileId: number) {

    // Solicita confirmación
    if(confirm('¿Estás seguro de que quieres eliminar este archivo? No podrás recuperarlo.')) {

      // Solicita la eliminación al backend
      this.fileService.deleteFile(fileId).subscribe({

        // Recarga el listado actualizado
        next: () => this.loadMyFiles(),

        // Informa del error producido
        error: (err) => alert('Error al borrar: ' + err.error?.message)
      });
    }
  }

  /*****************************************************************************
   * DESCARGA DE ARCHIVOS
   *****************************************************************************/

  /*
   * Descarga un archivo seleccionado por el usuario.
   */
  downloadFile(file: FileItem) {

    // Solicita el contenido binario al backend
    this.fileService.downloadFile(file.id).subscribe({

      next: (blob: Blob) => {

        // Crea una URL temporal local en la memoria del navegador con los 
        // datos del archivo
        const url = window.URL.createObjectURL(blob);
        
        // Crea dinámicamente un enlace invisible para iniciar la descarga
        const anchor = document.createElement('a');

        // Asigna la URL temporal
        anchor.href = url;

         // Conserva el nombre original del archivo
        anchor.download = file.original_name;
        
        // Inserta temporalmente el elemento en el DOM
        document.body.appendChild(anchor);

        // Simula el clic de descarga
        anchor.click();

        // Elimina el elemento temporal
        document.body.removeChild(anchor);
        
        // Libera la URL temporal creada
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {

        // Registra información detallada del error
        console.error('Error en la descarga', err);

        // Informa al usuario del fallo producido
        alert('Hubo un problema al descargar el archivo.');
      }
    });
  }

  /*****************************************************************************
   * UTILIDADES
   *****************************************************************************/

  /*
   * Convierte una cantidad de bytes a la unidad más adecuada
   */
  formatBytes(bytes: any): string {
    
    // Convierte el valor recibido a número
    const numericBytes = Number(bytes);
    
    // Gestiona valores nulos, vacíos o inválidos
    if (!numericBytes || isNaN(numericBytes) || numericBytes === 0) return '- Bytes';
    
    // Factor de conversión base
    const k = 1024;

    // Unidades soportadas
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];

    // Calcula la unidad adecuada
    const i = Math.floor(Math.log(numericBytes) / Math.log(k));
    
    // Devuelve el valor formateado
    return parseFloat((numericBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /*
   * Actualiza simultáneamente los listados de archivos personales y globales
   */
  refreshFiles() {

    // Activa la animación de actualización
    this.isRefreshing.set(true);
    
    // Recarga los archivos personales
    this.loadMyFiles();

    // Recarga los archivos globales
    this.loadGlobalFiles();

    // Mantiene la animación brevemente
    setTimeout(() => this.isRefreshing.set(false), 1000);
  }

  
}