/*******************************************************************************
 * ARCHIVO: global-resources.component.ts                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente encargado de la gestión de recursos globales de la plataforma.   *
 * Permite al administrador visualizar, subir y eliminar archivos compartidos  *
 * para todos los alumnos y supervisar el consumo de almacenamiento            *
 * respecto a la cuota configurada en el sistema.                              *
 *******************************************************************************/

import { Component, OnInit, inject, signal, computed } from '@angular/core';          // Decoradores, señales reactivas e inyección de dependencias de Angular
import { CommonModule } from '@angular/common';                                       // Directivas estructurales básicas de Angular
import { AdminService } from '../../../core/services/admin.service';                  // Servicio centralizado de administración del sistema
import { FileService } from '../../../core/services/file.service';                    // Servicio utilizado para recuperar el listado de recursos globales
import { HeaderComponent } from '../../../shared/layouts/header/header.component';    // Componente visual de cabecera
import { SidenavComponent } from '../../../shared/layouts/sidenav/sidenav.component'; // Componente visual del menú lateral de navegación

/*
 * Define la estructura tipada utilizada para representar los recursos 
 * globales dentro del componente
 */
export interface GlobalFileRecord {
  id: number;             // Identificador único
  original_name: string;  // Nombre original del archivo
  size_bytes: number;     // Tamaño del archivo expresado en bytes
  created_at?: string;    // Fecha de creación del recurso
}

/*
 * Declaración del componente autónomo (Standalone) encargado de la gestión
 * de recursos globales compartidos entre todos los usuarios.
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-global-resources',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias visuales utilizadas por la plantilla
  imports: [CommonModule, HeaderComponent, SidenavComponent],

  // Ruta de la plantilla HTML asociada
  templateUrl: './global-resources.component.html'
})

export class GlobalResourcesComponent implements OnInit {

  // Servicio administrativo utilizado para operaciones de gestión
  private adminService = inject(AdminService);

  // Servicio utilizado para consultar recursos globales
  private fileService = inject(FileService);

  /*****************************************************************************
   * ESTADOS REACTIVOS
   *****************************************************************************/

  // Lista reactiva de recursos globales
  globalFiles = signal<GlobalFileRecord[]>([]);

  // Indica si el listado está siendo cargado
  isLoading = signal<boolean>(true);

  // Indica si existe una subida en curso
  isUploading = signal<boolean>(false);

  /*****************************************************************************
   * ALMACENAMIENTO
   *****************************************************************************/

  // Cuota máxima por defecto de almacenamiento configurada en el sistema
  storageQuotaMB = signal<number>(200);

  // Tamaño total ocupado por los recursos globales
  totalGlobalBytes = signal<number>(0);

  // Recalcula el almacenamiento ocupado si cambia la cuota máxima
  isQuotaExceeded = computed(() => {

    // Compara el espacio ocupado contra el límite configurado
    return this.totalGlobalBytes() > (this.storageQuotaMB() * 1024 * 1024);
  });
  

  // Canal reactivo utilizado para mostrar mensajes al administrador
  actionMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  /*
   * Punto de entrada del ciclo de vida del componente
   * Recupera el listado de recursos globales y la cuota máxima de almacenamiento
   */
  ngOnInit(): void {

    // Recupera los recursos globlales compartidos
    this.loadGlobalFiles();

    // Recupera la configuración global del sistema
    this.loadSystemSettings();
  }

  /*
   * Recupera la configuración global almacenada en el servidor
   * Se utiliza para conocer la cuota real de almacenamiento
   */
  loadSystemSettings(): void {

    // Solicita la configuración global
    this.adminService.getSystemSettings().subscribe({

      next: (res) => {

        // Verifica que existe la cuota en la configuración
        if (res.data && res.data.storage_quota_mb) {

          // Actualiza la cuota local
          this.storageQuotaMB.set(parseInt(res.data.storage_quota_mb, 10));
        }
      },

      // Registra errores
      error: (err) => console.error("Error leyendo configuración global", err)
    });
  }

  /*
   * Recupera todos los recursos globales y actualiza el almacenamiento empleado
   */
  loadGlobalFiles(): void {

    // Activa el estado de carga
    this.isLoading.set(true);

    // Solicita los recursos globales
    this.fileService.getGlobalFiles().subscribe({

      next: (files: any) => {

        // Actualiza el listado
        this.globalFiles.set(files);

        // Calcula el tamaño total ocupado por todos los archivos
        const total = files.reduce((acumulador: number, file: any) => acumulador + Number(file.size_bytes), 0);

        // Actualiza el espacio total consumido
        this.totalGlobalBytes.set(total);

        // Finaliza el estado de carga
        this.isLoading.set(false);
      },

      error: (err: any) => {

        // Muestra información detallada del error
        this.showFeedback('error', 'Error cargando recursos globales: ' + (err.error?.message || err.message));

        // Finaliza el estado de carga
        this.isLoading.set(false);
      }
    });
  }
  
  /*
   * Gestiona la selección de un archivo y valida que la cuota
   * global de almacenamiento no sea superada.
   */
  onFileSelected(event: any): void {

    // Recupera el archivo seleccionado
    const file: File = event.target.files[0];

    // Finaliza si no existe archivo
    if (!file) return;

    // Calcula el límite máximo permitido
    const maxBytes = this.storageQuotaMB() * 1024 * 1024;

    // Recupera el espacio actualmente ocupado
    const currentBytes = this.totalGlobalBytes();

    // Calcula el espacio total disponible si el archivo es subido
    const projectedBytes = currentBytes + file.size;

    // Comprueba si se superaría la cuota
    if (projectedBytes > maxBytes) {
      
      // Calcula el espacio restante disponible
      const remainingMB = Math.max(0, (maxBytes - currentBytes) / (1024 * 1024)).toFixed(2);

      // Calcula el tamaño del archivo seleccionado
      const fileMB = (file.size / (1024 * 1024)).toFixed(2);

      // Informa del motivo del rechazo
      this.showFeedback(
        'error', 
        `Cuota de almacenamiento superada. Te quedan ${remainingMB} MB libres y el archivo pesa ${fileMB} MB.`
      );
      
      // Limpia el input HTML para que pueda seleccionar otro archivo
      event.target.value = '';
      return;
    }

    // Activa el estado visual de subida
    this.isUploading.set(true);

    // Limpia mensajes anteriores
    this.actionMessage.set(null);

    // Envía el archivo al backend
    this.adminService.uploadGlobalFile(file).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isUploading.set(false);

         // mensaje de éxito
        this.showFeedback('success', `El archivo '${file.name}' ha sido subido correctamente a los recursos globales.`);

        // Recarga la lista de achivos globales
        this.loadGlobalFiles();
      },
      error: (err) => {

        // Finaliza el estado de carga
        this.isUploading.set(false);

        // Muestra el error recibido
        this.showFeedback('error', 'Error al subir: ' + (err.error?.message || 'Error de conexión'));
      }
    });
  }

  /*
   * Elimina un recurso global del repositorio común de la plataforma
   */
  deleteGlobalFile(file: GlobalFileRecord): void {

    // Solicita confirmación antes de ejecutar
    if (confirm(`Vas a eliminar '${file.original_name}'.\n\nEste archivo desaparecerá del espacio de trabajo de TODOS los alumnos.\n¿Continuar?`)) {

      // Envía al backend la solicitud de eliminación del recurso global
      this.adminService.deleteGlobalFile(file.id).subscribe({

        // Se ejecuta cuando la eliminación se completa correctamente
        next: (res) => {

          // Mensaje de éxito
          this.showFeedback('success', `Recurso '${file.original_name}' eliminado correctamente.`);

          // Recarga el listado de recursos globales
          this.loadGlobalFiles();
        },

        // Muestra el mensaje de error recibido desde el servidor
        error: (err) => this.showFeedback('error', err.error?.message || 'Error al eliminar el archivo.')
      });
    }
  }

  /*
   * Convierte bytes en la unidad de almacenamiento más apropiada
   */
  formatBytes(bytes: any): string {

    // Convierte el valor recibido a formato numérico
    const numericBytes = Number(bytes);

    // Si el valor es inválido o nulo devuelve cero bytes
    if (!numericBytes || isNaN(numericBytes) || numericBytes === 0) return '0 Bytes';

    // Factor de conversión binario estándar
    const k = 1024;

    // Unidades de almacenamiento soportadas
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];

    // Calcula la unidad más adecuada
    const i = Math.floor(Math.log(numericBytes) / Math.log(k));

    // Devuelve el valor convertido con dos decimales de precisión
    return parseFloat((numericBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /*
   * Muestra un mensaje temporal de éxito o error en la interfaz de usuario.
   */
  private showFeedback(type: 'success' | 'error', text: string): void {

    // Actualiza el estado reactivo con el mensaje recibido
    this.actionMessage.set({ type, text });

    // Elimina automáticamente la notificación
    setTimeout(() => this.actionMessage.set(null), 6000);
  }
}