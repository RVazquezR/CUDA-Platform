/*******************************************************************************
 * ARCHIVO: user-management.component.ts                                       *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente de administración encargado de la gestión completa de usuarios   *
 * de la plataforma. Permite consultar cuentas registradas, realizar búsquedas *
 * dinámicas, modificar datos de usuarios, gestionar tokens, suspender o       *
 * activar cuentas, eliminar usuarios, generar contraseñas temporales y        *
 * ejecutar operaciones masivas de mantenimiento académico.                    *
 *******************************************************************************/

import { Component, OnInit, inject, signal, computed } from '@angular/core';          // Decoradores, ciclo de vida, inyección de dependencias y Signals de Angular
import { CommonModule } from '@angular/common';                                       // Directivas estructurales comunes de Angular
import { FormsModule } from '@angular/forms';                                         // Soporte para formularios y vinculación de datos bidireccional
import { AdminService, AdminUserRecord } from '../../../core/services/admin.service'; // Capa de servicios y tipados de administración
import { AuthService } from '../../../core/services/auth.service';                    // Servicio de identidad y autorización
import { HeaderComponent } from '../../../shared/layouts/header/header.component';    // Componente visual de cabecera
import { SidenavComponent } from '../../../shared/layouts/sidenav/sidenav.component'; // Componente visual del menú lateral de navegación

/*
 * Declaración del componente autónomo (Standalone) encargado de acoplar la 
 * lógica de administración de usuarios con su plantilla y dependencias
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-user-management',

  // Define el componente como Standalone
  standalone: true,
  
  // Dependencias utilizadas dentro de la plantilla HTML
  imports: [CommonModule, FormsModule, HeaderComponent, SidenavComponent],

  // Archivo HTML asociado al componente
  templateUrl: './user-management.component.html'
})

export class UserManagementComponent implements OnInit {

  // Servicio principal encargado de las operaciones administrativas
  private adminService = inject(AdminService);

  // Servicio de autenticación expuesto públicamente para el HTML
  public authService = inject(AuthService);

  /*****************************************************************************
  * ESTADOS REACTIVOS Y PROPIEDADES
  *****************************************************************************/

  // Almacena la lista completa de usuarios obtenida desde el backend
  users = signal<AdminUserRecord[]>([]);

  // Indica si existe una operación de carga en ejecución
  isLoading = signal<boolean>(true);

  // Canal de mensajes visuales mostrado al administrador
  actionMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);


  // Texto introducido en el buscador de usuarios
  searchQuery = signal<string>('');

  /*
   * Lista reactiva filtrada según el contenido introducido en el buscador
   */
  filteredUsers = computed(() => {

    // Obtiene el texto de búsqueda normalizado
    const query = this.searchQuery().toLowerCase();

    // Si no existe filtro devuelve todos los usuarios
    if (!query) return this.users();
    
    // Filtrado por nombre, correo o identificador
    return this.users().filter(user => 
      user.name.toLowerCase().includes(query) || 
      user.email.toLowerCase().includes(query) ||
      user.id.toString().includes(query)
    );
  });
  
  // Estado modal editar usuario
  isEditModalOpen = signal<boolean>(false);                     
  selectedUserForEdit = signal<AdminUserRecord | null>(null);
  editName = signal<string>('');
  editEmail = signal<string>('');
  editRole = signal<'admin' | 'normal'>('normal');

  // Estado modal gestión de tokens
  isTokenModalOpen = signal<boolean>(false);
  selectedUserForTokens = signal<AdminUserRecord | null>(null);
  tokenAction = signal<'add' | 'remove' | 'set'>('add');
  tokenAmount = signal<number>(1);
  isSaving = signal<boolean>(false);

  // Estado modal generar contraseña temporal
  isTempPasswordModalOpen = signal<boolean>(false);
  tempPasswordGenerated = signal<string>('');
  rescuedUserName = signal<string>('');


  /*
   * Punto de entrada del ciclo de vida del componente
   * Inicializa el directorio de usuarios al montar el componente
   */
  ngOnInit(): void {

    // Carga la lista completa de usuarios
    this.loadUsers();
  }

  /*
   * Recupera todos los usuarios registrados en la plataforma
   */
  loadUsers(): void {

    // Activa indicador de carga
    this.isLoading.set(true);

    // Solicita los usuarios al backend
    this.adminService.getAllUsers().subscribe({

      // Petición completada correctamente
      next: (data) => {

        // Actualiza la lista reactiva
        this.users.set(data);

        // Desactiva indicador de carga
        this.isLoading.set(false);
      },

      // Error durante la consulta
      error: (err) => {

        // Muestra mensaje de error
        this.showFeedback('error', 'Error al cargar usuarios: ' + err.error?.message);

        // Desactiva indicador de carga
        this.isLoading.set(false);
      }
    });
  }

  /*
   * Activa o suspende una cuenta de usuario
   */
  toggleStatus(user: AdminUserRecord): void {

    // Calcula el nuevo estado objetivo
    const newStatus = !user.is_active;

    // Texto descriptivo para el cuadro de confirmación
    const actionText = newStatus ? 'ACTIVAR' : 'SUSPENDER';
    
    // Solicita confirmación del administrador
    if (confirm(`¿Estás seguro de que deseas ${actionText} la cuenta de ${user.name}?`)) {

      // Ejecuta el cambio de estado
      this.adminService.toggleUserStatus(user.id, newStatus).subscribe({
        next: (res) => {

          // Muestra mensaje de éxito
          this.showFeedback('success', res.message);

          // Recarga la tabla
          this.loadUsers(); 
        },

        // Error durante el cambio de estado
        error: (err) => this.showFeedback('error', err.error?.message)
      });
    }
  }

  /*
   * Elimina permanentemente una cuenta de usuario.
   */
  deleteUser(user: AdminUserRecord): void {

    // Solicita confirmación
    if (confirm(`¿Está seguro de que quiere ELIMINAR permanentemente a ${user.name} y todos sus archivos e historial de tareas?`)) {

      // Ejecuta el borrado
      this.adminService.deleteUser(user.id).subscribe({

        next: (res) => {

          // Muestra mensaje de éxito
          this.showFeedback('success', res.message);

          // Recarga la tabla
          this.loadUsers();
        },

        // Error durante la operación
        error: (err) => this.showFeedback('error', err.error?.message)
      });
    }
  }

  /*
   * Elimina todos los usuarios con rol de estudiante con el objetivo de
   * reiniciar completamente un curso
   */
  purgeAllStudents(): void {

    // Solicita confirmación al administrador
    const confirmation = confirm('Estás a punto de ELIMINAR a todos los usuarios con rol de Estudiante.\nSe destruirán sus cuentas, archivos e historial de ejecuciones.\n\n¿Está seguro de ejecutar el Reset de Curso?');
    
    // Solo si hay confirmación
    if (confirmation) {

      // Activa el spinner de carga
      this.isLoading.set(true);

      // Ejecuta la eliminación
      this.adminService.deleteAllStudents().subscribe({

        next: (res) => {

          // Muestra mensaje de éxito
          this.showFeedback('success', res.message);

          // Actualiza la tabla
          this.loadUsers();
        },
        error: (err) => {

          // Muestra mensaje de error
          this.showFeedback('error', err.error?.message || 'Error en el eliminado masivo de la base de datos');

          // Desactiva indicador de carga
          this.isLoading.set(false);
        }
      });
    }
  }

  /*
   * Abre la ventana de edición y carga los campos del formulario
   * con la información actual del usuario seleccionado
   */
  openEditModal(user: AdminUserRecord): void {

    // Almacena una referencia al usuario que será modificado
    this.selectedUserForEdit.set(user);

    // Inicializa el campo nombre
    this.editName.set(user.name);

    // Inicializa el campo correo
    this.editEmail.set(user.email);

    // Inicializa el selector de rol
    this.editRole.set(user.role);

    // Muestra la ventana de edición
    this.isEditModalOpen.set(true);
  }

  /*
   * Cierra la ventana de edición y libera la referencia al usuario
   */
  closeEditModal(): void {

    // Oculta el modal de edición
    this.isEditModalOpen.set(false);

    // Elimina el usuario seleccionado de la memoria
    this.selectedUserForEdit.set(null);
  }

  /*
   * Envía al servidor los cambios realizados sobre un usuario desde el
   * formulario de edición
   */
  saveUserEdit(): void {

    // Recupera el usuario seleccionado
    const user = this.selectedUserForEdit();

    // Si no existe un usuario seleccionado se aborta la operación
    if (!user) return;

    // Activa el indicador visual de guardado
    this.isSaving.set(true);
    
    // Construye el objeto con los datos actualizados del formulario
    const payload = { 
      name: this.editName(), 
      email: this.editEmail(), 
      role: this.editRole() 
    };

    // Envía los cambios al backend
    this.adminService.updateUser(user.id, payload).subscribe({

      next: (res) => {

        // Muestra confirmación
        this.showFeedback('success', res.message);

        // Desactiva el indicador de guardado
        this.isSaving.set(false);

        // Cierra la ventana tras completar la actualización
        this.closeEditModal();

        // Recarga la tabla para reflejar los cambios
        this.loadUsers();
      },
      error: (err) => {

        // Muestra el mensaje de error
        this.showFeedback('error', err.error?.message);

        // Desactiva el indicador de guardado
        this.isSaving.set(false);
      }
    });
  }

  /*
   * Abre la ventana para modificar el saldo de tokens del estudiante
   */
  openTokenModal(user: AdminUserRecord): void {

    // Los administradores tienen tokens ilimitados
    if (user.role === 'admin') {
      this.showFeedback('error', 'Los administradores tienen tokens infinitos por defecto.');
      return;
    }

    // Guarda el usuario seleccionado
    this.selectedUserForTokens.set(user);

    // Selecciona como acción inicial añadir tokens
    this.tokenAction.set('add');

    // Inicializa la cantidad por defecto en una unidad
    this.tokenAmount.set(1);

    // Muestra la ventana de gestión de tokens
    this.isTokenModalOpen.set(true);
  }

  /*
   * Cierra el diálogo de gestión de tokens y limpia el usuario asociado
   */
  closeTokenModal(): void {
    this.isTokenModalOpen.set(false);
    this.selectedUserForTokens.set(null);
  }

  /*
   * Envía al backend la operación de añadir, restar o establecer tokens
   * para el usuario seleccionado
   */
  saveTokens(): void {

    // Recupera el usuario seleccionado
    const user = this.selectedUserForTokens();
    if (!user) return;

    // Activa el estado visual de guardado
    this.isSaving.set(true);

    // Envía la acción y cantidad configuradas al backend
    this.adminService.updateTokens(user.id, this.tokenAction(), this.tokenAmount()).subscribe({

      next: (res) => {

        // Muestra mensaje de éxito
        this.showFeedback('success', res.message);

        // Desactiva el estado de guardado
        this.isSaving.set(false);

        // Cierra la ventana
        this.closeTokenModal();

        // Refresca la tabla para mostrar el nuevo saldo
        this.loadUsers();
      },
      error: (err) => {

        // Muestra el error devuelto
        this.showFeedback('error', err.error?.message);

        // Desactiva el estado de guardado
        this.isSaving.set(false);
      }
    });
  }



  /*
   * Genera una contraseña temporal para un usuario que solicita ayuda al
   * administrador para recuperar su contraseña
   */
  forcePasswordReset(user: AdminUserRecord): void {

    // Solicita confirmación
    if (confirm(`¿Estás seguro de generar una nueva contraseña temporal para ${user.name}?`)) {

      // Activa el indicador global de carga
      this.isLoading.set(true);

      // Solicita al backend la generación de una contraseña temporal
      this.adminService.forcePasswordReset(user.id).subscribe({

        next: (res) => {

          // Desactiva el indicador de carga
          this.isLoading.set(false);

          // Guarda el nombre del usuario
          this.rescuedUserName.set(user.name);

          // Almacena la contraseña generada por el backend en texto plano
          this.tempPasswordGenerated.set(res.data.tempPassword);

          // Muestra el modal con la contraseña generada
          this.isTempPasswordModalOpen.set(true);

          // Refresca la tabla para eliminar la alerta
          this.loadUsers();
        },
        error: (err) => {

          // Desactiva el indicador de carga
          this.isLoading.set(false);

          // Muestra el error recibido
          this.showFeedback('error', err.error?.message);
        }
      });
    }
  }

  /*
   * Cierra la ventana que muestra la contraseña temporal generada y elimina 
   * la contraseña almacenada
   */
  closeTempPasswordModal(): void {
    this.isTempPasswordModalOpen.set(false);
    this.tempPasswordGenerated.set('');
  }

  /*
   * Limpia el contenido del buscador 
   */
  clearSearch(): void {
    this.searchQuery.set('');
  }

  /*
   * Centraliza la visualización de mensajes informativos
   * y de error en la interfaz de forma temporal
   */
  private showFeedback(type: 'success' | 'error', text: string): void {

    // Publica el mensaje en el estado reactivo
    this.actionMessage.set({ type, text });

    // Elimina automáticamente el mensaje
    setTimeout(() => this.actionMessage.set(null), 5000);

    // Desplaza la vista al inicio para garantizar visibilidad
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  }
}