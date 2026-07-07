/*******************************************************************************
 * ARCHIVO: profile-settings.component.ts                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente encargado de la gestión del perfil personal del usuario.         *
 * Permite consultar la información básica de la cuenta y actualizar el nombre *
 * de usuario o la contraseña de acceso.                                       *
 *******************************************************************************/

import { Component, OnInit, inject, signal } from '@angular/core';                    // Decoradores, señales reactivas e interfaces del ciclo de vida
import { CommonModule } from '@angular/common';                                       // Directivas estructurales básicas de Angular
import { FormsModule } from '@angular/forms';                                         // Módulo necesario para formularios basados en ngModel
import { UserService, UserProfile } from '../../../core/services/user.service';       // Servicio de usuario y estructura tipada del perfil
import { HeaderComponent } from '../../../shared/layouts/header/header.component';    // Componente visual de cabecera
import { SidenavComponent } from '../../../shared/layouts/sidenav/sidenav.component'; // Componente visual del menú lateral de navegación

/*
 * Declaración del componente autónomo (Standalone) encargado de la gestión 
 * del perfil personal del usuario.
*/
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-profile-settings',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias visuales utilizadas por la plantilla
  imports: [CommonModule, FormsModule, HeaderComponent, SidenavComponent],

  // Ruta de la plantilla HTML asociada
  templateUrl: './profile-settings.component.html'
})

export class ProfileSettingsComponent implements OnInit {

  // Servicio encargado de recuperar y actualizar el perfil del usuario
  private userService = inject(UserService);


  // Almacena la información del perfil autenticado
  user = signal<UserProfile | null>(null);

  // Indica si los datos del perfil están siendo cargados
  isLoading = signal<boolean>(true);
  

  // Determina si la interfaz se encuentra en modo edición
  isEditing = signal<boolean>(false);


  // Nombre temporal utilizado durante la edición
  editName = signal<string>('');

  // Contraseña temporal utilizada durante la edición
  editPassword = signal<string>('');

  // Controla la visibilidad del campo de contraseña
  showPassword = signal<boolean>(false);

  // Indica si existe una operación de guardado en curso
  isSaving = signal<boolean>(false);

  // Canal reactivo utilizado para mostrar mensajes de éxito o error
  updateMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  /*
   * Punto de entrada del ciclo de vida del componente
   * Recupera la información del perfil autenticado
   */
  ngOnInit() {

    // Solicita los datos actuales del perfil
    this.loadProfile();
  }

  /*
   * Recupera la información actual del usuario desde el backend
   * y sincroniza los estados reactivos locales
   */
  loadProfile() {

    // Activa el estado visual de carga
    this.isLoading.set(true);

    // Solicita la información del perfil
    this.userService.getProfile().subscribe({

      next: (res) => {

        // Actualiza los datos del usuario
        this.user.set(res.data);

        // Inicializa el nombre editable con el valor actual
        this.editName.set(res.data.name);

        // Finaliza el estado de carga
        this.isLoading.set(false);
      },
      error: (err) => {

        // Registra información detallada del error
        console.error(err);

        // Finaliza el estado de carga
        this.isLoading.set(false);
      }
    });
  }

  /*
   * Alterna entre los modos de visualización y edición del perfil,
   * restaurando los valores originales cuando se cancela la edición.
   */
  toggleEdit() {

    // Modifica el estado actual del modo edición
    this.isEditing.set(!this.isEditing());

    // Elimina mensajes anteriores
    this.updateMessage.set(null);

    // Restaura los valores cuando la edición es cancelada por el usuario
    if (!this.isEditing()) {
      
      // Recupera el nombre original del perfil
      this.editName.set(this.user()!.name);

      // Elimina cualquier contraseña introducida
      this.editPassword.set('');

      // Vuelve a ocultar la contraseña por seguridad
      this.showPassword.set(false);
    }
  }

  /*
   * Guarda las modificaciones realizadas sobre el perfil enviando 
   * únicamente los campos que han cambiado
   */
  saveProfile() {

    // Elimina mensajes anteriores
    this.updateMessage.set(null);

    // Construye dinámicamente la actualización
    const payload: any = {};

    // Añade el nombre si ha sido modificado
    if (this.editName() !== this.user()?.name) payload.name = this.editName();

    // Añade la contraseña si se ha introducido una nueva
    if (this.editPassword().trim()) payload.password = this.editPassword();

    // Finaliza la edición si no existen cambios
    if (Object.keys(payload).length === 0) {

      // Cierra el modo edición
      this.toggleEdit();
      return;
    }

    // Activa el estado visual de guardado
    this.isSaving.set(true);

    // Envía las modificaciones al backend
    this.userService.updateProfile(payload).subscribe({

      next: (res) => {

        // Finaliza el estado de guardado
        this.isSaving.set(false);

        // Muestra el mensaje de confirmación
        this.updateMessage.set({ type: 'success', text: res.message });

        // Elimina la contraseña temporal almacenada
        this.editPassword.set('');

        // Finaliza el modo edición
        this.isEditing.set(false);

        // Recarga el perfil actualizado
        this.loadProfile();
      },
      error: (err) => {

        // Finaliza el estado de guardado
        this.isSaving.set(false);

        // Muestra el error recibido desde el servidor
        this.updateMessage.set({ type: 'error', text: err.error?.message || 'Error al actualizar.' });
      }
    });
  }
}